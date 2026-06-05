import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';

import { Notification, NotificationChannel, NotificationType } from '../../domain/entities/notification.aggregate';
import { NotificationPreference } from '../../domain/entities/notification.aggregate';
import {
  NotificationOrmEntity,
  NotificationPreferenceOrmEntity,
  ProcessedEventOrmEntity,
} from '../../infrastructure/persistence/typeorm/entities/notification.orm-entities';
import { NotificationGateway } from '../../infrastructure/realtime/notification.gateway';
import { FcmPushService } from '../../infrastructure/push/fcm-push.service';
import { NOTIFICATION_TEMPLATES } from '../../domain/events/notification.events';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

/**
 * DeliveryEngine — Multi-channel Notification Dispatcher
 *
 * Flow:
 *   Event Payload
 *     -> create Notification domain object
 *     -> persist to DB (notifications table)
 *     -> load user preferences
 *     -> dispatch to channels:
 *         1. enableRealtime -> Socket.IO emit
 *         2. enablePush     -> FCM (with quiet hours check)
 *         3. enableEmail    -> Email stub (non-blocking)
 *
 * Design decisions:
 * - Persist first -> realtime second (client can recover if realtime is missed)
 * - Channel dispatch does not throw -> logs error, continues
 * - Duplicate guard: eventId in processed_events (at consumer level)
 */
@Injectable()
export class DeliveryEngine {
  private readonly logger = new Logger(DeliveryEngine.name);

  constructor(
    @InjectRepository(NotificationOrmEntity)
    private readonly notifRepo: Repository<NotificationOrmEntity>,
    @InjectRepository(NotificationPreferenceOrmEntity)
    private readonly prefRepo: Repository<NotificationPreferenceOrmEntity>,
    private readonly gateway:   NotificationGateway,
    private readonly fcm:       FcmPushService,
    private readonly config:    ConfigService,
  ) {
    const smtpUser = this.config.get<string>('SMTP_USER');
    const smtpPass = this.config.get<string>('SMTP_PASS');
    const smtpHost = this.config.get<string>('SMTP_HOST', 'smtp.gmail.com');
    const smtpPort = this.config.get<number>('SMTP_PORT', 587);
    
    if (smtpUser && smtpPass) {
      this.transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpPort === 465,
        auth: {
          user: smtpUser,
          pass: smtpPass,
        },
      });
      this.logger.log(`SMTP configured for ${smtpUser} via ${smtpHost}`);
    } else {
      this.logger.warn('SMTP credentials not provided, will use stub for emails');
    }
  }

  private transporter: nodemailer.Transporter | null = null;

  /**
   * Dispatch notification for a user.
   * Idempotency guard must be implemented at the consumer level before calling this method.
   */
  async dispatch(params: {
    userId:    string;
    type:      NotificationType;
    channels:  NotificationChannel[];
    title:     string;
    body:      string;
    metadata?: Record<string, any>;
    // Optional structured payloads for specific realtime events
    realtimePayload?: {
      bookingUpdate?:  object;
      queueUpdate?:    object;
      chargingUpdate?: object;
    };
  }): Promise<Notification> {

    // 1. Create domain aggregate
    const notification = Notification.create({
      userId:   params.userId,
      type:     params.type,
      channel:  params.channels[0],  // primary channel
      title:    params.title,
      body:     params.body,
      metadata: params.metadata ?? {},
    });

    // 2. Persist
    await this.notifRepo.save(
      this.notifRepo.create({
        id:       notification.id,
        userId:   notification.userId,
        type:     notification.type,
        channel:  notification.channel,
        title:    notification.title,
        body:     notification.body,
        status:   'sent',
        metadata: notification.metadata,
        readAt:   null,
      }),
    );

    // 3. Load preferences
    const prefRow = await this.prefRepo.findOneBy({ userId: params.userId });
    const pref = prefRow
      ? NotificationPreference.reconstitute({
          userId:          prefRow.userId,
          enablePush:      prefRow.enablePush,
          enableRealtime:  prefRow.enableRealtime,
          enableEmail:     prefRow.enableEmail,
          enableSms:       prefRow.enableSms,
          quietHoursStart: prefRow.quietHoursStart,
          quietHoursEnd:   prefRow.quietHoursEnd,
          updatedAt:       prefRow.updatedAt,
        })
      : NotificationPreference.createDefault(params.userId);

    // 4. Dispatch to channels

    const dispatches: Promise<void>[] = [];
    const dispatchedChannels: string[] = [];

    // Channel: Realtime (Socket.IO)
    if (params.channels.includes('in_app')) {
      if (pref.enableRealtime) {
        dispatches.push(this.dispatchRealtime(notification, params.realtimePayload));
        dispatchedChannels.push('in_app');
      } else {
        this.logger.warn(`[${params.type}] in_app requested but enableRealtime=false for user=${params.userId}`);
      }
    }

    // Channel: Push (FCM)
    if (params.channels.includes('push')) {
      if (pref.canSendPushNow()) {
        dispatches.push(this.dispatchPush(notification));
        dispatchedChannels.push('push');
      } else {
        this.logger.warn(
          `[${params.type}] push requested but blocked for user=${params.userId}: enablePush=${pref.enablePush} quietHoursStart=${pref.quietHoursStart} quietHoursEnd=${pref.quietHoursEnd} currentHour=${new Date().getUTCHours()}`,
        );
      }
    }

    // Channel: Email stub
    if (params.channels.includes('email')) {
      if (pref.enableEmail) {
        dispatches.push(this.dispatchEmailStub(notification));
        dispatchedChannels.push('email');
      } else {
        this.logger.warn(`[${params.type}] email requested but enableEmail=false for user=${params.userId}`);
      }
    }

    // Fire all channels in parallel - non-blocking on individual failures
    await Promise.allSettled(dispatches);

    this.logger.log(
      `Dispatched ${params.type} -> user=${params.userId} channels=[${dispatchedChannels.join(',')}]`,
    );

    return notification;
  }

  // Channel Dispatch Implementations

  private async dispatchRealtime(
    notification: Notification,
    realtimePayload?: {
      bookingUpdate?:  object;
      queueUpdate?:    object;
      chargingUpdate?: object;
    },
  ): Promise<void> {
    try {
      // Always emit generic 'notification' event
      this.gateway.emitToUser(notification.userId, {
        id:        notification.id,
        type:      notification.type,
        title:     notification.title,
        body:      notification.body,
        metadata:  notification.metadata,
        createdAt: notification.createdAt,
      });

      // Emit type-specific events for client-side routing
      if (realtimePayload?.bookingUpdate) {
        this.gateway.emitBookingUpdate(notification.userId, realtimePayload.bookingUpdate as any);
      }
      if (realtimePayload?.queueUpdate) {
        this.gateway.emitQueueUpdate(notification.userId, realtimePayload.queueUpdate as any);
      }
      if (realtimePayload?.chargingUpdate) {
        this.gateway.emitChargingUpdate(notification.userId, realtimePayload.chargingUpdate as any);
      }
    } catch (err: any) {
      this.logger.error(`Realtime dispatch failed: ${err.message}`);
    }
  }

  private async dispatchPush(notification: Notification): Promise<void> {
    try {
      await this.fcm.sendToUser({
        userId:            notification.userId,
        title:             notification.title,
        body:              notification.body,
        notificationType:  notification.type,
        notifPayload:      notification.metadata,
        data: {
          notificationId: notification.id,
          type:           notification.type,
          ...this.serializeMetadataForFcm(notification.metadata),
        },
      });
    } catch (err: any) {
      this.logger.error(`Push dispatch failed: ${err.message}`);
    }
  }

  private async dispatchEmailStub(notification: Notification): Promise<void> {
    const overrideEmail = this.config.get<string>('TEST_EMAIL_OVERRIDE');
    const targetEmail = overrideEmail || notification.metadata?.targetEmail;

    if (!targetEmail) {
      this.logger.warn(`[EMAIL STUB] Cannot send email for user=${notification.userId}, no target email specified and no override`);
      return;
    }

    if (!this.transporter) {
      this.logger.log(
        `[EMAIL STUB] Would send email to target=${targetEmail} subject="${notification.title}"`,
      );
      return;
    }

    try {
      await this.transporter.sendMail({
        from: this.config.get<string>('SMTP_FROM', '"EVoltSync" <default.name201@gmail.com>'),
        to: targetEmail,
        subject: notification.title,
        html: notification.body,
      });
      this.logger.log(`[EMAIL] Sent email to ${targetEmail} (subject: "${notification.title}")`);
    } catch (err: any) {
      this.logger.error(`[EMAIL] Failed to send email to ${targetEmail}: ${err.message}`);
    }
  }

  /** FCM data payload only accepts Record<string, string> */
  private serializeMetadataForFcm(metadata: Record<string, any>): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [k, v] of Object.entries(metadata)) {
      result[k] = String(v);
    }
    return result;
  }

  // Idempotency Helper (used at consumer level)

  async isProcessed(
    eventId: string,
    repo: Repository<ProcessedEventOrmEntity>,
  ): Promise<boolean> {
    return repo.existsBy({ event_id: eventId });
  }

  async markProcessed(
    eventId: string,
    eventType: string,
    repo: Repository<ProcessedEventOrmEntity>,
  ): Promise<void> {
    await repo.save({ event_id: eventId, eventType });
  }
}
