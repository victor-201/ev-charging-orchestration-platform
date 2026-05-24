import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import {
  StationOrmEntity, ChargingPointOrmEntity, ConnectorOrmEntity, CityOrmEntity,
  PricingRuleOrmEntity, MaintenanceOrmEntity, IncidentOrmEntity,
  ProcessedEventOrmEntity, OutboxOrmEntity,
} from '../../infrastructure/persistence/typeorm/entities/station.orm-entities';
import { StationRepository } from '../../infrastructure/persistence/typeorm/repositories/station.repository';
import { ChargerRepository } from '../../infrastructure/persistence/typeorm/repositories/charger.repository';
import { OutboxEventBus, EVENT_BUS } from '../../infrastructure/messaging/outbox/outbox-event-bus';
import { STATION_REPOSITORY } from '../../domain/repositories/station.repository.interface';
import { CHARGER_REPOSITORY } from '../../domain/repositories/charger.repository.interface';
import {
  CreateStationUseCase, UpdateStationUseCase, GetStationUseCase,
  ListStationsUseCase, GetNearbyStationsUseCase,
  AddChargerUseCase, UpdateChargerStatusUseCase,
  GetChargersUseCase, GetCitiesUseCase,
  GetChargerAvailabilityUseCase, SlaMonitoringUseCase,
  GetStationByChargerUseCase, DeleteStationUseCase,
} from '../../application/use-cases/station.use-cases';
import { GetPricingUseCase, CalculateSessionFeeUseCase, UpsertPricingRuleUseCase, DeactivatePricingRuleUseCase, ListPricingRulesUseCase } from '../../application/use-cases/pricing.use-case';
import { StationController } from './station.controller';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { RolesGuard }   from '../../shared/guards/roles.guard';
import { RedisAvailabilityCache } from '../../infrastructure/cache/redis-availability.cache';
import { ChargerStatusConsumer } from '../../infrastructure/messaging/consumers/charger-status.consumer';
import { Cron } from '@nestjs/schedule';
import { Injectable, Logger } from '@nestjs/common';

// SLA Cron Scheduler

@Injectable()
class SlaScheduler {
  private readonly logger = new Logger(SlaScheduler.name);
  constructor(private readonly slaUC: SlaMonitoringUseCase) {}

  @Cron('0 0 * * *') // daily at midnight
  async runDailySla() {
    this.logger.log('Running daily SLA monitoring...');
    await this.slaUC.computeDailySla();
  }
}

// -----------------------------------------------------------------------------

@Module({
  imports: [
    ConfigModule,
    ScheduleModule.forRoot(),
    TypeOrmModule.forFeature([
      StationOrmEntity, ChargingPointOrmEntity, ConnectorOrmEntity, CityOrmEntity,
      PricingRuleOrmEntity, MaintenanceOrmEntity, IncidentOrmEntity,
      ProcessedEventOrmEntity, OutboxOrmEntity,
    ]),
  ],
  controllers: [StationController],
  providers: [
    // Repositories
    { provide: STATION_REPOSITORY, useClass: StationRepository },
    { provide: CHARGER_REPOSITORY, useClass: ChargerRepository },
    // Event bus
    { provide: EVENT_BUS, useClass: OutboxEventBus },
    // Guards
    JwtAuthGuard,
    RolesGuard,
    // Cache
    RedisAvailabilityCache,
    // Event consumers
    ChargerStatusConsumer,
    // Use cases
    CreateStationUseCase, UpdateStationUseCase, GetStationUseCase,
    ListStationsUseCase, GetNearbyStationsUseCase,
    AddChargerUseCase, UpdateChargerStatusUseCase,
    GetChargersUseCase, GetCitiesUseCase,
    GetChargerAvailabilityUseCase, SlaMonitoringUseCase,
    GetStationByChargerUseCase, DeleteStationUseCase,
    GetPricingUseCase, CalculateSessionFeeUseCase,
    UpsertPricingRuleUseCase, DeactivatePricingRuleUseCase, ListPricingRulesUseCase,
    // Scheduled jobs
    SlaScheduler,
  ],
})
export class StationModule {}
