import { DomainEvent } from '../../domain/events/domain-event.base';
import { EntityManager } from 'typeorm';

export interface IEventBus {
  publishAll(events: DomainEvent[], manager?: EntityManager): Promise<void>;
  publish(event: { eventType: string; payload: object }, manager?: EntityManager): Promise<void>;
}

export const EVENT_BUS = Symbol('EVENT_BUS');
