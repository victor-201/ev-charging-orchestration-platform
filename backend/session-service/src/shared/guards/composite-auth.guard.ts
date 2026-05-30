import {
  Injectable, CanActivate, ExecutionContext,
  UnauthorizedException, Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector }     from '@nestjs/core';
import * as jwt          from 'jsonwebtoken';
import * as fs           from 'fs';
import * as crypto       from 'crypto';
import { IS_PUBLIC_KEY } from './jwt-auth.guard';
import type { AuthenticatedUser } from './jwt-auth.guard';

@Injectable()
export class CompositeAuthGuard implements CanActivate {
  private readonly logger = new Logger(CompositeAuthGuard.name);
  private publicKey: string | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly reflector: Reflector,
  ) {
    this.loadPublicKey();
  }

  private safeCompare(a: string, b: string): boolean {
    try {
      const aHash = crypto.createHash('sha256').update(a).digest();
      const bHash = crypto.createHash('sha256').update(b).digest();
      return crypto.timingSafeEqual(aHash, bHash);
    } catch {
      return false;
    }
  }

  private loadPublicKey(): void {
    const inlineKey = this.config.get<string>('JWT_PUBLIC_KEY');
    if (inlineKey) {
      this.publicKey = inlineKey.replace(/\\n/g, '\n');
      return;
    }
    const keyPath = this.config.get<string>('JWT_PUBLIC_KEY_PATH');
    if (keyPath && fs.existsSync(keyPath)) {
      this.publicKey = fs.readFileSync(keyPath, 'utf8');
      return;
    }
  }

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') return true;

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();

    // 1. Check for Kiosk Key
    const rawKioskKey = request.headers['x-kiosk-key'];
    const kioskKey = Array.isArray(rawKioskKey) ? rawKioskKey[0] : rawKioskKey;
    const configuredKioskKey = this.config.get<string>('KIOSK_API_KEY');

    if (kioskKey && configuredKioskKey && this.safeCompare(kioskKey, configuredKioskKey)) {
      request.user = {
        id: '00000000-0000-4000-8000-000000000000',
        email: 'kiosk@ev-platform.local',
        role: 'kiosk',
        roles: ['kiosk'],
        sessionId: null,
      } satisfies AuthenticatedUser;

      const correlationId = request.headers['x-correlation-id'];
      if (correlationId) request.correlationId = correlationId;

      return true;
    }

    // 2. Fallback to JWT validation
    const token = this.extractToken(request);
    if (!token) {
      if (kioskKey) {
        throw new UnauthorizedException('Invalid Kiosk API Key');
      }
      throw new UnauthorizedException('Missing authorization token or invalid kiosk key');
    }

    if (!this.publicKey) {
      this.loadPublicKey();
      if (!this.publicKey) {
        throw new UnauthorizedException('Server JWT public key not configured');
      }
    }

    try {
      const issuer   = this.config.get<string>('JWT_ISSUER', 'ev-iam-service');
      const audience = this.config.get<string>('JWT_AUDIENCE', 'ev-platform');

      const payload = jwt.verify(token, this.publicKey, {
        algorithms: ['RS256'],
        issuer,
        audience,
        clockTolerance: 5,
      }) as jwt.JwtPayload;

      if (!payload.sub) throw new UnauthorizedException('Token missing subject');

      request.user = {
        id:        payload.sub,
        email:     payload.email   ?? '',
        role:      payload.role    ?? (payload.roles as string[])?.[0] ?? 'user',
        roles:     payload.roles   ?? [payload.role ?? 'user'],
        sessionId: payload.sessionId ?? null,
      } satisfies AuthenticatedUser;

      // Forward correlation-id from Kong header
      const correlationId = request.headers['x-correlation-id'];
      if (correlationId) request.correlationId = correlationId;

      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Invalid token';
      this.logger.warn(`[CompositeAuthGuard] Token rejected: ${msg}`);
      throw new UnauthorizedException(msg);
    }
  }

  private extractToken(request: { headers: Record<string, string> }): string | null {
    const auth = request.headers?.authorization;
    return auth?.startsWith('Bearer ') ? auth.slice(7).trim() : null;
  }
}
