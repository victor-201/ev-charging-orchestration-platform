import { Injectable, Inject, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as admin from 'firebase-admin';
import { FIREBASE_ADMIN } from './firebase.module';
import { DeviceOrmEntity } from '../persistence/typeorm/entities/notification.orm-entities';
import { translateToVietnamese } from './vi-notification-translator';

// Public interfaces (used by DeliveryEngine)

export interface FcmMessage {
  token:              string;
  title:              string;
  body:               string;
  data?:              Record<string, string>;
  imageUrl?:          string;
  notificationType?:  string;  // used for Vietnamese translation
  notifPayload?:      any;     // raw event payload for body interpolation
}

export interface FcmResult {
  token:   string;
  success: boolean;
  error?:  string;
}

// FcmPushService

/**
 * FcmPushService - FCM HTTP v1 push notification delivery via firebase-admin SDK.
 *
 * Design:
 * - Receive firebase-admin.app via DI token FIREBASE_ADMIN
 * - If app = null -> stub mode (log warning, do not send)
 * - Send each message independently (FCM HTTP v1 has no batch endpoint)
 * - Automatically clean up stale tokens (UNREGISTERED / NOT_FOUND)
 *
 * Concurrency: maximum CONCURRENCY = 50 concurrent sends (bounded)
 */
@Injectable()
export class FcmPushService {
  private readonly logger      = new Logger(FcmPushService.name);
  private readonly CONCURRENCY = 50;
  private readonly stubMode:   boolean;
  private readonly messaging:  admin.messaging.Messaging | null;

  constructor(
    @Inject(FIREBASE_ADMIN)
    private readonly firebaseApp: admin.app.App | null,

    @InjectRepository(DeviceOrmEntity)
    private readonly deviceRepo: Repository<DeviceOrmEntity>,
  ) {
    if (this.firebaseApp) {
      this.messaging = this.firebaseApp.messaging();
      this.stubMode  = false;
      this.logger.log('FcmPushService ready (firebase-admin messaging)');
    } else {
      this.messaging = null;
      this.stubMode  = true;
      this.logger.warn('FcmPushService running in STUB mode - Push notifications disabled');
    }
  }

  /**
   * Send push notification to all registered devices of the user.
   * Purges invalid tokens automatically.
   */
  async sendToUser(params: {
    userId:             string;
    title:              string;
    body:               string;
    data?:              Record<string, string>;
    notificationType?:  string;
    notifPayload?:      any;
  }): Promise<{ sent: number; failed: number; tokens: string[] }> {
    const devices = await this.deviceRepo.find({
      where: { userId: params.userId },
    });

    if (devices.length === 0) {
      this.logger.debug(`No devices for user=${params.userId}`);
      return { sent: 0, failed: 0, tokens: [] };
    }

    const messages: FcmMessage[] = devices.map((d) => ({
      token:             d.pushToken,
      title:             params.title,
      body:              params.body,
      data:              params.data ?? {},
      notificationType:  params.notificationType,
      notifPayload:      params.notifPayload,
    }));

    const results = await this.sendAll(messages);

    const failures  = results.filter((r) => !r.success);
    const successes = results.filter((r) => r.success);

    const staleTokens = failures
      .filter((r) => this.isStaleTokenError(r.error))
      .map((r) => r.token);

    if (staleTokens.length > 0) {
      await this.purgeStaleTokens(staleTokens);
    }

    this.logger.log(
      `Push -> user=${params.userId}: ${successes.length}/${devices.length} delivered`
      + (failures.length > 0 ? `, ${failures.length} failed` : ''),
    );

    return {
      sent:   successes.length,
      failed: failures.length,
      tokens: devices.map((d) => d.pushToken),
    };
  }

  async sendToToken(params: {
    token:  string;
    title:  string;
    body:   string;
    data?:  Record<string, string>;
  }): Promise<FcmResult> {
    return this.sendSingle({
      token: params.token,
      title: params.title,
      body:  params.body,
      data:  params.data,
    });
  }

  private async sendAll(messages: FcmMessage[]): Promise<FcmResult[]> {
    if (this.stubMode) {
      this.logger.warn(`[STUB] Skipping ${messages.length} FCM message(s)`);
      return messages.map((m) => ({ token: m.token, success: true }));
    }

    const results: FcmResult[] = [];

    for (let i = 0; i < messages.length; i += this.CONCURRENCY) {
      const chunk = messages.slice(i, i + this.CONCURRENCY);
      const chunkResults = await Promise.all(chunk.map((m) => this.sendSingle(m)));
      results.push(...chunkResults);
    }

    return results;
  }

  private async sendSingle(message: FcmMessage): Promise<FcmResult> {
    if (this.stubMode || !this.messaging) {
      return { token: message.token, success: true };
    }

    const data: Record<string, string> = {
      ...(message.data ?? {}),
      title: message.title,   // English – for client foreground processing
      body:  message.body,    // English – for client foreground processing
      ...(message.imageUrl ? { imageUrl: message.imageUrl } : {}),
    };

    // Translate to Vietnamese for OS-level notification display
    // (shown when app is in background or killed)
    const vi = translateToVietnamese(
      message.notificationType ?? '',
      message.title,
      message.body,
      message.notifPayload ?? {},
    );

    const payload: admin.messaging.Message = {
      token: message.token,
      notification: {
        title: vi.title,
        body:  vi.body,
        ...(message.imageUrl ? { imageUrl: message.imageUrl } : {}),
      },
      data,
      android: {
        priority: 'high',
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            badge: 1,
            'content-available': 1,
          },
        },
      },
    };

    try {
      const messageId = await this.messaging.send(payload);
      this.logger.debug(`FCM sent: messageId=${messageId} token=...${message.token.slice(-8)}`);
      return { token: message.token, success: true };
    } catch (err: any) {
      const code    = err.code ?? err.errorInfo?.code ?? 'UNKNOWN';
      const errMsg  = `${code}: ${err.message}`;
      this.logger.warn(
        `FCM send failed token=...${message.token.slice(-8)}: ${errMsg}`,
      );
      return { token: message.token, success: false, error: code };
    }
  }

  private isStaleTokenError(error?: string): boolean {
    if (!error) return false;
    const staleIndicators = [
      'messaging/registration-token-not-registered',
      'messaging/invalid-registration-token',
      'messaging/invalid-argument',
      'NOT_FOUND',
      'UNREGISTERED',
    ];
    return staleIndicators.some((ind) =>
      error.toLowerCase().includes(ind.toLowerCase()),
    );
  }

  private async purgeStaleTokens(tokens: string[]): Promise<void> {
    for (const token of tokens) {
      await this.deviceRepo.delete({ pushToken: token });
      this.logger.warn(`Purged stale token: ...${token.slice(-8)}`);
    }
  }
}
