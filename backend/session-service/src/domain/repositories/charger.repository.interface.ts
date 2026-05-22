import { EntityManager } from 'typeorm';

export interface ConnectorInfo {
  connectorType: string;
  maxPowerKw: number;
}

export interface ChargerInfo {
  id: string;
  stationId: string;
  /** Primary connector */
  connectorType: string;
  /** All connectors on the charger (1 charger can have multiple types) */
  connectors: ConnectorInfo[];
  maxPowerKw: number;
  status: 'available' | 'in_use' | 'offline' | 'reserved' | 'faulted';
}

export interface IChargerRepository {
  findById(id: string): Promise<ChargerInfo | null>;
  findAvailableByStation(stationId?: string, connectorType?: string): Promise<ChargerInfo[]>;
  isAvailable(chargerId: string): Promise<boolean>;
  /** Lock row FOR UPDATE inside a transaction */
  lockForUpdate(chargerId: string, manager: EntityManager): Promise<void>;
  updateStatus(chargerId: string, status: ChargerInfo['status']): Promise<void>;
}

export const CHARGER_REPOSITORY = Symbol('CHARGER_REPOSITORY');
