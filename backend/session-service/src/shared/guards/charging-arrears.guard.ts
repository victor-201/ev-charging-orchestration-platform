import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  SetMetadata,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Reflector } from '@nestjs/core';
import { UserDebtReadModelOrmEntity } from '../../infrastructure/persistence/typeorm/entities/session.orm-entities';

export const SKIP_CHARGING_ARREARS = 'skipChargingArrearsCheck';

/**
 * @SkipChargingArrearsCheck() - Skip arrears check for specific handler.
 * Used for GET endpoints (read history) or admin/stop (staff intervention).
 */
export const SkipChargingArrearsCheck = () => SetMetadata(SKIP_CHARGING_ARREARS, true);

/**
 * ChargingArrearsGuard - Block bad debt at charging station
 *
 * Protects POST /charging/start:
 * - User hasOutstandingDebt = true -> 403 Forbidden with top-up instructions.
 * - Admin/Staff (admin/stop, telemetry) -> bypass completely via @SkipChargingArrearsCheck().
 *
 * No remote service calls - check local DB (< 1ms latency).
 */
@Injectable()
export class ChargingArrearsGuard implements CanActivate {
  constructor(
    @InjectRepository(UserDebtReadModelOrmEntity)
    private readonly debtRepo: Repository<UserDebtReadModelOrmEntity>,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_CHARGING_ARREARS, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) return true;

    const request = context.switchToHttp().getRequest();
    const user    = request.user;
    if (!user?.id) return true;

    // Admin/Staff/Kiosk can intervene even with debt or bypass check completely
    if (user.roles?.some((r: string) => ['admin', 'staff', 'kiosk'].includes(r))) return true;

    const debt = await this.debtRepo.findOneBy({ userId: user.id });
    if (debt?.hasOutstandingDebt) {
      const formatted = Number(debt.arrearsAmount).toLocaleString('vi-VN');
      throw new ForbiddenException(
        `Your account has an outstanding debt of ${formatted} VND. ` +
        `Please top up your EV Wallet to settle the debt before continuing to charge.`,
      );
    }

    return true;
  }
}
