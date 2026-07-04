import {
  Controller, Get, Post, Body, Param, Query,
  HttpCode, HttpStatus, ParseUUIDPipe, UseGuards, NotFoundException
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import {
  PlanOrmEntity,
  SubscriptionOrmEntity,
  InvoiceOrmEntity,
  UserReadModelOrmEntity,
} from '../../infrastructure/persistence/typeorm/entities/payment.orm-entities';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../shared/guards/roles.guard';
import { Roles, Public } from '../../shared/decorators/roles.decorator';
import { CurrentUser } from '../../shared/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../shared/guards/jwt-auth.guard';

@Controller('billing')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BillingController {
  constructor(
    @InjectRepository(PlanOrmEntity)
    private readonly planRepo: Repository<PlanOrmEntity>,
    @InjectRepository(SubscriptionOrmEntity)
    private readonly subRepo: Repository<SubscriptionOrmEntity>,
    @InjectRepository(InvoiceOrmEntity)
    private readonly invoiceRepo: Repository<InvoiceOrmEntity>,
    @InjectRepository(UserReadModelOrmEntity)
    private readonly userReadModelRepo: Repository<UserReadModelOrmEntity>,
  ) {}

  /**
   * GET /api/v1/billing/arrears
   */
  @Get('arrears')
  @Roles('admin')
  async getArrears(@Query('userId') userId?: string, @Query('status') status?: string) {
    const query = this.invoiceRepo.createQueryBuilder('invoice');
    
    // Treat unpaid/overdue invoices as arrears
    if (status === 'ACTIVE') {
      query.where('invoice.status IN (:...statuses)', { statuses: ['unpaid', 'overdue'] });
    } else if (status === 'CLEARED') {
      query.where('invoice.status = :status', { status: 'paid' });
    }
    
    if (userId) {
      query.andWhere('invoice.user_id = :userId', { userId });
    }
    
    const invoices = await query.getMany();

    // Fetch user details from read model
    const userIds = [...new Set(invoices.map(inv => inv.userId))].filter(Boolean);
    const users = userIds.length > 0
      ? await this.userReadModelRepo.findBy({ userId: In(userIds) })
      : [];
    const userMap = new Map(users.map(u => [u.userId, u]));

    return invoices.map(inv => {
      const userRead = userMap.get(inv.userId);
      return {
        ...inv,
        status: inv.status === 'paid' ? 'SUCCESS' : 'PENDING',
        user: userRead ? {
          fullName: userRead.fullName,
          email: userRead.email,
        } : null,
      };
    });
  }

  /**
   * POST /api/v1/billing/arrears/:id/clear
   */
  @Post('arrears/:id/clear')
  @Roles('admin', 'system')
  @HttpCode(HttpStatus.OK)
  async clearArrears(@Param('id', ParseUUIDPipe) id: string, @Body('note') note: string) {
    const invoice = await this.invoiceRepo.findOne({ where: { id } });
    if (!invoice) throw new NotFoundException('Arrear not found');
    
    invoice.status = 'paid';
    await this.invoiceRepo.save(invoice);
    return invoice;
  }

  /**
   * GET /api/v1/billing/plans
   */
  @Get('plans')
  @Public()
  async getPlans() {
    return this.planRepo.find({ where: { isActive: true } });
  }

  /**
   * POST /api/v1/billing/plans
   */
  @Post('plans')
  @Roles('admin')
  @HttpCode(HttpStatus.CREATED)
  async createPlan(@Body() body: any) {
    const plan = this.planRepo.create({
      name: body.name,
      priceAmount: body.price,
      durationDays: body.durationDays,
      description: JSON.stringify(body.benefits),
      isActive: true,
    });
    return this.planRepo.save(plan);
  }

  /**
   * POST /api/v1/billing/subscriptions
   */
  @Post('subscriptions')
  @HttpCode(HttpStatus.CREATED)
  async createSubscription(@Body('planId', ParseUUIDPipe) planId: string, @CurrentUser() user: AuthenticatedUser) {
    const plan = await this.planRepo.findOne({ where: { id: planId } });
    if (!plan) throw new NotFoundException('Plan not found');

    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(startDate.getDate() + plan.durationDays);

    const subscription = this.subRepo.create({
      userId: user.id,
      planId: plan.id,
      startDate,
      endDate,
      status: 'active',
      autoRenew: true,
    });
    return this.subRepo.save(subscription);
  }
}
