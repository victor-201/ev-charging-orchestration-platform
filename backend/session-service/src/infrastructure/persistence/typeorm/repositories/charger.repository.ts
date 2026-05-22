import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager } from 'typeorm';
import { ChargerReadModelOrmEntity } from '../entities/booking.orm-entities';
import {
  IChargerRepository,
  ChargerInfo,
} from '../../../../domain/repositories/charger.repository.interface';

@Injectable()
export class ChargerRepository implements IChargerRepository {
  constructor(
    @InjectRepository(ChargerReadModelOrmEntity)
    private readonly repo: Repository<ChargerReadModelOrmEntity>,
  ) {}

  async findById(id: string): Promise<ChargerInfo | null> {
    const e = await this.repo.findOneBy({ chargerId: id });
    return e ? this.toInfo(e) : null;
  }

  async findAvailableByStation(
    stationId?: string,
    connectorType?: string,
  ): Promise<ChargerInfo[]> {
    const qb = this.repo.createQueryBuilder('c')
      .where('c.is_active = true');
    if (stationId) {
      qb.andWhere('c.station_id = :stationId', { stationId });
    }
    if (connectorType) {
      qb.andWhere('c.connector_type = :connectorType', { connectorType });
    }
    const entities = await qb.getMany();
    return entities.map(this.toInfo.bind(this));
  }

  async isAvailable(chargerId: string): Promise<boolean> {
    const c = await this.repo.findOneBy({ chargerId, isActive: true });
    return c !== null;
  }

  /**
   * Row-level lock - serialises concurrent booking requests for same charger.
   * Uses charger_read_models table (source of truth in booking-service).
   */
  async lockForUpdate(chargerId: string, manager: EntityManager): Promise<void> {
    await manager.query(
      `SELECT charger_id FROM charger_read_models WHERE charger_id = $1 FOR UPDATE`,
      [chargerId],
    );
  }

  async updateStatus(chargerId: string, status: ChargerInfo['status']): Promise<void> {
    // charger_read_models is updated via RabbitMQ events from station-service
    // Direct writes only for sync/read consistency
    await this.repo.update({ chargerId }, { syncedAt: new Date() });
  }

  async upsertFromEvent(data: {
    chargerId: string;
    stationId: string;
    stationName: string;
    connectorType: string;
    maxPowerKw?: number;
    isActive?: boolean;
  }): Promise<void> {
    await this.repo.upsert(
      {
        chargerId:     data.chargerId,
        stationId:     data.stationId,
        stationName:   data.stationName,
        connectorType: data.connectorType,
        maxPowerKw:    data.maxPowerKw ?? null,
        isActive:      data.isActive ?? true,
        syncedAt:      new Date(),
      },
      ['chargerId'],
    );
  }

  private toInfo(e: ChargerReadModelOrmEntity): ChargerInfo {
    return {
      id:            e.chargerId,
      stationId:     e.stationId,
      connectorType: e.connectorType,
      // charger_read_model stores 1 primary connector type.
      // Sufficient to validate connector match in CreateBookingUseCase.
      connectors:    [{ connectorType: e.connectorType, maxPowerKw: e.maxPowerKw ?? 0 }],
      maxPowerKw:    e.maxPowerKw ?? 0,
      status:        e.isActive ? 'available' : 'offline',
    };
  }
}
