import {
  Controller, Post, Get, Body, Param, Query, Req, Headers, Header,
  HttpCode, HttpStatus, ParseUUIDPipe, Logger, Redirect,
  BadRequestException, NotFoundException, UseGuards, Res,
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
  PayArrearsUseCase,
  PayArrearsVNPayInitUseCase,
} from '../../application/use-cases/payment.use-cases';
import {
  CreatePaymentDto, WalletTopupDto, WalletPayDto,
  GetTransactionHistoryDto,
} from '../../application/dtos/payment.dto';
import { VNPayReturnParams } from '../../infrastructure/vnpay/vnpay.service';
import { JwtAuthGuard }             from '../../shared/guards/jwt-auth.guard';
import { CompositeAuthGuard }       from '../../shared/guards/composite-auth.guard';
import { RolesGuard }               from '../../shared/guards/roles.guard';
import { CurrentUser } from '../../shared/decorators/current-user.decorator';
import { Roles, Public } from '../../shared/decorators/roles.decorator';
import type { AuthenticatedUser }   from '../../shared/guards/jwt-auth.guard';
import { WalletDomainException }    from '../../domain/entities/wallet.aggregate';
import { ConfigService }            from '@nestjs/config';

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
@UseGuards(CompositeAuthGuard, RolesGuard)
export class PaymentController {
  private readonly logger = new Logger(PaymentController.name);

  constructor(
    private readonly createPayment:           CreatePaymentUseCase,
    private readonly vnpayCallback:           HandleVNPayCallbackUseCase,
    private readonly walletTopupInit:         WalletTopupInitUseCase,
    private readonly walletPay:               WalletPayUseCase,
    private readonly getBalance:              GetWalletBalanceUseCase,
    private readonly getTxHistory:            GetTransactionHistoryUseCase,
    private readonly getPayment:              GetPaymentUseCase,
    private readonly paymentOrchestrator:     PaymentOrchestratorUseCase,
    private readonly refund:                  RefundUseCase,
    private readonly payArrears:              PayArrearsUseCase,
    private readonly payArrearsVNPayInit:     PayArrearsVNPayInitUseCase,
    private readonly config:                  ConfigService,
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
    const isKiosk = user.role === 'kiosk' || user.roles?.includes('kiosk');
    return this.createPayment.execute({
      userId:    user.id,
      bookingId: dto.bookingId,
      amount:    dto.amount,
      ipAddr:    req.ip ?? dto.ipAddr,
      bankCode:  dto.bankCode,
      relatedType: isKiosk ? 'charging_session' : 'booking',
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
   *
   * VNPay redirects the user's browser here after payment.
   * Serves an HTML page with a button to re-open the Flutter app via deep link.
   *
   * Chrome Android (v83+) blocks automatic navigation to custom URI schemes
   * (ev://) without a user gesture — it shows "website not found".
   * Fix: use Android Intent URL (intent://) which Chrome supports natively,
   * with a visible "Mở ứng dụng" button as the primary CTA.
   */
  @Get('payments/vnpay-return')
  @Public()
  async vnpayReturn(
    @Query() query: Record<string, string>,
    @Headers('user-agent') userAgent: string,
    @Res() res: any,
  ): Promise<void> {
    const deepLinkBase = this.config.get<string>(
      'VNPAY_DEEP_LINK_SCHEME',
      'ev://app/wallet/topup/processing',
    );
    // Android package name: base + flavor suffix (.dev) + build type suffix (.debug)
    // e.g. com.evcharging.ev_charging_app.dev.debug for dev flavor debug build
    const androidPackage = this.config.get<string>(
      'ANDROID_APP_PACKAGE',
      'com.evcharging.ev_charging_app.dev.debug',
    );

    try {
      // Process the VNPay callback (update DB, publish events)
      await this.vnpayCallback.execute(query as VNPayReturnParams);
    } catch (err: any) {
      this.logger.error(`VNPay callback error: ${err.message}`);
      // On error, still redirect to app so user sees the result
    }

    // Only forward vnp_* params to the deep link (strip fbclid and other tracking params)
    const vnpParams  = new URLSearchParams(
      Object.fromEntries(Object.entries(query).filter(([k]) => k.startsWith('vnp_')))
    ).toString();
    const evDeepLink = `${deepLinkBase}?${vnpParams}`;
    const isSuccess  = query['vnp_ResponseCode'] === '00';
    const statusText = isSuccess ? 'Thanh toán thành công!' : 'Thanh toán thất bại';

    // Build Android intent:// URL — Chrome Android handles this natively.
    // Chrome blocks ev:// custom scheme from web pages, but intent:// is always allowed.
    // Format: intent://<host>/<path>?<params>#Intent;scheme=ev;package=<pkg>;action=...;end
    const evUrl    = new URL(evDeepLink);
    const intentPath = evUrl.host + evUrl.pathname + '?' + vnpParams;
    const intentUrl  = `intent://${intentPath}#Intent;scheme=ev;package=${androidPackage};action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;end`;

    const isIOS = /iphone|ipad|ipod/i.test(userAgent || '');
    const isAndroid = /android/i.test(userAgent || '');

    if (isIOS) {
      this.logger.log(`VNPay return [iOS Auto-Redirect] → ev: ${evDeepLink}`);
      res.redirect(HttpStatus.FOUND, evDeepLink);
      return;
    }

    if (isAndroid) {
      this.logger.log(`VNPay return [Android Auto-Redirect] → intent: ${intentUrl}`);
      res.redirect(HttpStatus.FOUND, intentUrl);
      return;
    }

    this.logger.log(`VNPay return [Desktop View] → ev: ${evDeepLink} | intent: ${intentUrl}`);

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>EV Charging — Kết quả thanh toán</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
           background: #0f1117; color: #fff; display: flex; align-items: center;
           justify-content: center; min-height: 100vh; padding: 24px; }
    .card { background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.12);
            border-radius: 20px; padding: 40px 32px; text-align: center; max-width: 360px; width: 100%; }
    .icon { width: 72px; height: 72px; border-radius: 50%; display: flex; align-items: center;
            justify-content: center; font-size: 32px; margin: 0 auto 20px; }
    .icon.ok  { background: #22c55e; }
    .icon.err { background: #ef4444; }
    h1 { font-size: 1.3rem; font-weight: 700; margin-bottom: 8px; }
    p  { font-size: 0.9rem; color: rgba(255,255,255,0.6); line-height: 1.5; margin-bottom: 6px; }
    .btn { display: block; margin-top: 28px; padding: 16px 32px;
           background: linear-gradient(135deg, #6C63FF, #3B82F6);
           color: #fff; border-radius: 14px; font-weight: 700;
           text-decoration: none; font-size: 1rem; text-align: center;
           box-shadow: 0 4px 20px rgba(108,99,255,0.4); }
    .note { font-size: 0.75rem; color: rgba(255,255,255,0.35); margin-top: 16px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon ${isSuccess ? 'ok' : 'err'}">${isSuccess ? '✓' : '✗'}</div>
    <h1>${statusText}</h1>
    <p>Nhấn nút bên dưới để quay lại ứng dụng.</p>
    <!--
      Android Chrome: dùng intent:// scheme — Chrome luôn xử lý intent:// đúng cách.
      iOS / Safari: dùng ev:// custom scheme được register trong AndroidManifest/Info.plist.
      ev:// trong <a href> bị Chrome Android block, intent:// thì không.
    -->
    <a id="open-btn" href="${intentUrl}" class="btn">Mở ứng dụng EV Charging</a>
    <p class="note">Nếu ứng dụng không mở, hãy quay lại thủ công.</p>
  </div>
  <script>
    // On iOS, use ev:// instead of intent:// (intent:// is Android-only)
    var isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    var targetUrl = isIOS ? '${evDeepLink}' : '${intentUrl}';
    if (isIOS) {
      document.getElementById('open-btn').href = '${evDeepLink}';
    }
    // Automatically redirect to launch the app
    try {
      window.location.href = targetUrl;
    } catch (err) {
      console.error('Auto-redirect blocked', err);
    }
  </script>
</body>
</html>`);
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
  @Roles('admin')
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
  @Header('Cache-Control', 'no-store, no-cache, must-revalidate')
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
    try {
      return await this.walletPay.execute({
        userId:    user.id,
        bookingId: dto.bookingId,
        amount:    dto.amount,
      });
    } catch (err) {
      if (err instanceof WalletDomainException) {
        // Insufficient balance / wallet not active → 400
        throw new BadRequestException(err.message);
      }
      throw err;
    }
  }

  /**
   * POST /api/v1/wallet/pay-arrears
   * Settle outstanding arrears using wallet balance.
   */
  @Post('wallet/pay-arrears')
  @HttpCode(HttpStatus.OK)
  async payArrearsFromWallet(
    @CurrentUser() user: AuthenticatedUser,
  ) {
    try {
      return await this.payArrears.execute({
        userId: user.id,
      });
    } catch (err: any) {
      if (err instanceof WalletDomainException) {
        throw new BadRequestException(err.message);
      }
      throw new BadRequestException(err.message || 'Payment failed');
    }
  }

  /**
   * POST /api/v1/wallet/pay-arrears-vnpay
   * Initiate VNPay payment to settle outstanding arrears directly.
   * Wallet balance is NOT affected — user pays exact debt via VNPay gateway.
   */
  @Post('wallet/pay-arrears-vnpay')
  @HttpCode(HttpStatus.CREATED)
  async payArrearsVNPay(
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: any,
    @Body('bankCode') bankCode?: string,
  ) {
    try {
      return await this.payArrearsVNPayInit.execute({
        userId:   user.id,
        ipAddr:   req.ip,
        bankCode,
      });
    } catch (err: any) {
      throw new BadRequestException(err.message || 'Failed to initiate arrears payment');
    }
  }

  /**
   * GET /api/v1/transactions
   */
  @Get('transactions')
  @Header('Cache-Control', 'no-store, no-cache, must-revalidate')
  async getTransactionHistory(
    @Query() query: GetTransactionHistoryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const isAdmin = user.role === 'admin' || user.roles?.includes('admin');
    return this.getTxHistory.execute(user.id, query.limit ?? 20, query.offset ?? 0, isAdmin, query.type, query.status);
  }
}
