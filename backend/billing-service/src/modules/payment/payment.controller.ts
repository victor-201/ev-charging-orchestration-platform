import {
  Controller, Post, Get, Body, Param, Query, Req, Headers,
  HttpCode, HttpStatus, ParseUUIDPipe, Logger,
  BadRequestException, NotFoundException, UseGuards,
} from '@nestjs/common';
import {
  CreatePaymentUseCase,
  HandleVNPayCallbackUseCase,
  WalletTopupInitUseCase,
  WalletPayUseCase,
  GetWalletBalanceUseCase,
  GetTransactionHistoryUseCase,
  GetPaymentUseCase,
  PaymentOrchestratorUseCase,
  RefundUseCase,
} from '../../application/use-cases/payment.use-cases';
import {
  CreatePaymentDto, WalletTopupDto, WalletPayDto,
  GetTransactionHistoryDto,
} from '../../application/dtos/payment.dto';
import { VNPayReturnParams } from '../../infrastructure/vnpay/vnpay.service';
import { JwtAuthGuard }             from '../../shared/guards/jwt-auth.guard';
import { RolesGuard }               from '../../shared/guards/roles.guard';
import { CurrentUser } from '../../shared/decorators/current-user.decorator';
import { Roles, Public } from '../../shared/decorators/roles.decorator';
import type { AuthenticatedUser }   from '../../shared/guards/jwt-auth.guard';

/**
 * PaymentController — Auth policy:
 *
 *   POST /payments/create          → @JwtAuthGuard  (any auth user)
 *   POST /payments/pay             → @JwtAuthGuard  (wallet-first orchestrator)
 *   GET  /payments/vnpay-return    → @Public        (VNPay callback, no JWT)
 *   GET  /payments/:id             → @JwtAuthGuard  (owner views their own payment)
 *   POST /payments/:id/refund      → @Roles('admin','staff')
 *   GET  /wallet/balance           → @JwtAuthGuard
 *   POST /wallet/topup             → @JwtAuthGuard
 *   POST /wallet/pay               → @JwtAuthGuard
 *   GET  /transactions             → @JwtAuthGuard
 */
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class PaymentController {
  private readonly logger = new Logger(PaymentController.name);

  constructor(
    private readonly createPayment:       CreatePaymentUseCase,
    private readonly vnpayCallback:       HandleVNPayCallbackUseCase,
    private readonly walletTopupInit:     WalletTopupInitUseCase,
    private readonly walletPay:           WalletPayUseCase,
    private readonly getBalance:          GetWalletBalanceUseCase,
    private readonly getTxHistory:        GetTransactionHistoryUseCase,
    private readonly getPayment:          GetPaymentUseCase,
    private readonly paymentOrchestrator: PaymentOrchestratorUseCase,
    private readonly refund:              RefundUseCase,
  ) {}

  /**
   * POST /api/v1/payments/create
   * Generates a VNPay payment URL for a booking.
   * Uses userId from JWT for verification.
   */
  @Post('payments/create')
  @HttpCode(HttpStatus.CREATED)
  async createVNPayPayment(
    @Body() dto: CreatePaymentDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: any,
  ) {
    return this.createPayment.execute({
      userId:    user.id,
      bookingId: dto.bookingId,
      amount:    dto.amount,
      ipAddr:    req.ip ?? dto.ipAddr,
      bankCode:  dto.bankCode,
    });
  }

  /**
   * POST /api/v1/payments/pay
   * Wallet-first orchestrator: attempt wallet payment first, fallback to VNPay.
   * Supports Idempotency-Key header to prevent duplicate charges.
   */
  @Post('payments/pay')
  @HttpCode(HttpStatus.OK)
  async pay(
    @Body() dto: CreatePaymentDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: any,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    if (!idempotencyKey) {
      throw new BadRequestException('Idempotency-Key header is required');
    }
    return this.paymentOrchestrator.execute({
      userId:         user.id,
      sessionId:      (dto as any).sessionId ?? '',
      bookingId:      dto.bookingId,
      amount:         dto.amount,
      idempotencyKey,
      ipAddr:         req.ip,
    });
  }

  /**
   * GET /api/v1/payments/vnpay-return
   * VNPay redirect — MUST be public (no Authorization header).
   */
  @Get('payments/vnpay-return')
  @Public()
  async vnpayReturn(@Query() query: Record<string, string>) {
    try {
      return await this.vnpayCallback.execute(query as VNPayReturnParams);
    } catch (err: any) {
      if (err.message === 'INVALID_CHECKSUM') {
        throw new BadRequestException('Invalid payment signature');
      }
      throw err;
    }
  }

  /**
   * GET /api/v1/payments/:id
   * User views payment details.
   */
  @Get('payments/:id')
  async getPaymentById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const tx = await this.getPayment.execute(id);
    if (!tx) throw new NotFoundException('Transaction not found');
    return tx;
  }

  /**
   * POST /api/v1/payments/:id/refund
   * Allows admin/staff to refund a completed transaction.
   */
  @Post('payments/:id/refund')
  @HttpCode(HttpStatus.OK)
  @Roles('admin', 'staff')
  async refundPayment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('reason') reason: string,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    if (!reason) throw new BadRequestException('Reason is required');
    return this.refund.execute({
      originalTransactionId: id,
      reason,
      refundedBy: admin.id,
    });
  }

  /**
   * GET /api/v1/wallet/balance
   */
  @Get('wallet/balance')
  async getWalletBalance(@CurrentUser() user: AuthenticatedUser) {
    return this.getBalance.execute(user.id);
  }

  /**
   * POST /api/v1/wallet/topup
   */
  @Post('wallet/topup')
  @HttpCode(HttpStatus.CREATED)
  async topupWallet(
    @Body() dto: WalletTopupDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: any,
  ) {
    return this.walletTopupInit.execute({
      userId:   user.id,
      amount:   dto.amount,
      ipAddr:   req.ip,
      bankCode: dto.bankCode,
    });
  }

  /**
   * POST /api/v1/wallet/pay
   * Direct wallet debit (no orchestration).
   */
  @Post('wallet/pay')
  @HttpCode(HttpStatus.OK)
  async payFromWallet(
    @Body() dto: WalletPayDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.walletPay.execute({
      userId:    user.id,
      bookingId: dto.bookingId,
      amount:    dto.amount,
    });
  }

  /**
   * GET /api/v1/transactions
   */
  @Get('transactions')
  async getTransactionHistory(
    @Query() query: GetTransactionHistoryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.getTxHistory.execute(user.id, query.limit ?? 20, query.offset ?? 0);
  }
}
