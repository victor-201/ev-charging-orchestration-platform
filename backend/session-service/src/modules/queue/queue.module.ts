import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QueueOrmEntity } from '../../infrastructure/persistence/typeorm/entities/booking.orm-entities';
import { ProcessedEventOrmEntity } from '../../infrastructure/persistence/typeorm/entities/session.orm-entities';
import { QueueRepository } from '../../infrastructure/persistence/typeorm/repositories/queue.repository';
import { PriorityQueueService } from '../../domain/services/priority-queue.service';
import {
  JoinQueueUseCase,
  LeaveQueueUseCase,
  ProcessQueueUseCase,
} from '../../application/use-cases/queue.use-case';
import { ChargerStatusConsumer } from '../../infrastructure/messaging/consumers/charger-status.consumer';
import { QueueController } from './queue.controller';
import { QUEUE_REPOSITORY } from '../../domain/repositories/queue.repository.interface';
import { BookingModule } from '../booking/booking.module';
import { CHARGER_REPOSITORY } from '../../domain/repositories/charger.repository.interface';

@Module({
  imports: [
    TypeOrmModule.forFeature([QueueOrmEntity, ProcessedEventOrmEntity]),
    BookingModule, // exports CreateBookingUseCase, CHARGER_REPOSITORY
  ],
  controllers: [QueueController],
  providers: [
    { provide: QUEUE_REPOSITORY, useClass: QueueRepository },
    PriorityQueueService,
    JoinQueueUseCase,
    LeaveQueueUseCase,
    ProcessQueueUseCase,
    ChargerStatusConsumer,
  ],
  exports: [PriorityQueueService, ProcessQueueUseCase],
})
export class QueueModule {}
