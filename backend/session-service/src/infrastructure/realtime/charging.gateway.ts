import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { OutboxOrmEntity } from '../persistence/typeorm/entities/session.orm-entities';

/**
 * ChargingGateway - Socket.IO realtime gateway.
 *
 * Clients join room by sessionId:
 *   socket.emit('join', { sessionId })
 *
 * Events emitted:
 *   - charging_started      (session.started)
 *   - charging_updated      (session.telemetry)
 *   - charging_completed    (session.completed)
 *   - charging_interrupted  (session.interrupted)
 *   - charging_error        (session.error)
 *   - charger_status        (charger.status.changed)
 *
 * Outbox polling every 2s to pick up new events (low-latency realtime).
 */
@WebSocketGateway({
  cors: { origin: '*' },
  namespace:  '/charging',
  transports: ['websocket', 'polling'],
})
@Injectable()
export class ChargingGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ChargingGateway.name);
  private readonly broadcastedIds = new Set<string>();

  // Mapping eventType -> socket event name
  private readonly EVENT_MAP: Record<string, string> = {
    'session.started':        'charging_started',
    'session.activated':      'charging_started',
    'session.telemetry':      'charging_updated',
    'session.completed':      'charging_completed',
    'session.interrupted':    'charging_interrupted',
    'session.error':          'charging_error',
    'charger.status.changed': 'charger_status',
  };

  constructor(
    @InjectRepository(OutboxOrmEntity)
    private readonly outboxRepo: Repository<OutboxOrmEntity>,
  ) {}

  afterInit(server: Server) {
    this.logger.log('ChargingGateway initialized');
  }

  handleConnection(client: Socket) {
    this.logger.debug(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.debug(`Client disconnected: ${client.id}`);
  }

  /** Client joins room by sessionId to receive realtime updates */
  @SubscribeMessage('join')
  handleJoin(
    @MessageBody() data: { sessionId: string },
    @ConnectedSocket() client: Socket,
  ) {
    if (!data?.sessionId) return;
    client.join(`session:${data.sessionId}`);
    this.logger.debug(`Client ${client.id} joined room session:${data.sessionId}`);
    client.emit('joined', { sessionId: data.sessionId });
  }

  /** Client joins by chargerId to receive charger status updates */
  @SubscribeMessage('subscribe_charger')
  handleSubscribeCharger(
    @MessageBody() data: { chargerId: string },
    @ConnectedSocket() client: Socket,
  ) {
    if (!data?.chargerId) return;
    client.join(`charger:${data.chargerId}`);
    this.logger.debug(`Client ${client.id} subscribed to charger:${data.chargerId}`);
  }

  /**
   * Broadcast event to room.
   * Called from OutboxPublisher after publishing to AMQP.
   */
  broadcastToSession(sessionId: string, event: string, payload: object): void {
    this.server.to(`session:${sessionId}`).emit(event, payload);
  }

  broadcastToCharger(chargerId: string, event: string, payload: object): void {
    this.server.to(`charger:${chargerId}`).emit(event, payload);
  }

  addBroadcastedId(id: string): void {
    this.broadcastedIds.add(id);
  }

  /**
   * Poll outbox every 2 seconds -> emit realtime events to connected clients.
   * Separated from AMQP publish (outbox.publisher.ts) for realtime low-latency.
   */
  @Cron('*/2 * * * * *')
  async pollAndBroadcast(): Promise<void> {
    const cutOff = new Date(Date.now() - 15_000);
    const events = await this.outboxRepo.find({
      where: [
        { status: 'pending' as any },
        { status: 'processed' as any, createdAt: MoreThan(cutOff) },
      ],
      order: { createdAt: 'ASC' },
      take:  100,
    });

    for (const event of events) {
      if (this.broadcastedIds.has(event.id)) {
        continue;
      }

      const socketEvent = this.EVENT_MAP[event.eventType];
      if (!socketEvent) continue;

      const payload = event.payload as Record<string, any>;

      // Broadcast to session room
      if (payload.sessionId) {
        this.broadcastToSession(payload.sessionId, socketEvent, payload);
      }

      // Broadcast to charger room
      if (payload.chargerId) {
        this.broadcastToCharger(payload.chargerId, socketEvent, payload);
      }

      this.broadcastedIds.add(event.id);
    }

    if (this.broadcastedIds.size > 2000) {
      this.broadcastedIds.clear();
    }
  }
}
