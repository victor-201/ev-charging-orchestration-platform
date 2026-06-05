import {
  Injectable, CanActivate, ExecutionContext,
  UnauthorizedException, Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector }     from '@nestjs/core';
import * as jwt          from 'jsonwebtoken';
import * as fs           from 'fs';

export const IS_PUBLIC_KEY = 'isPublic';

export interface AuthenticatedUser {
  id:        string;
  email:     string;
  role:      string;
  roles:     string[];
  sessionId: string | null;
  stationId?: string | null;
  stationIds?: string[];
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name);
  private publicKey: string | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly reflector: Reflector,
  ) {
    this.loadPublicKey();
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
    this.logger.warn('[JwtAuthGuard] JWT_PUBLIC_KEY / JWT_PUBLIC_KEY_PATH not configured');
  }

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') return true;

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const request = context.switchToHttp().getRequest();
    const token   = this.extractToken(request);

    if (isPublic) {
      if (token) {
        if (!this.publicKey) {
          this.loadPublicKey();
        }
        if (this.publicKey) {
          try {
            const issuer   = this.config.get<string>('JWT_ISSUER', 'ev-iam-service');
            const audience = this.config.get<string>('JWT_AUDIENCE', 'ev-platform');

            const payload = jwt.verify(token, this.publicKey, {
              algorithms: ['RS256'],
              issuer,
              audience,
              clockTolerance: 5,
            }) as jwt.JwtPayload;

            if (payload.sub) {
              request.user = {
                id:        payload.sub,
                email:     payload.email   ?? '',
                role:      payload.role    ?? (payload.roles as string[])?.[0] ?? 'user',
                roles:     payload.roles   ?? [payload.role ?? 'user'],
                sessionId: payload.sessionId ?? null,
                stationId: payload.stationId ?? null,
                stationIds: payload.stationIds ?? [],
              } satisfies AuthenticatedUser;
            }
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Invalid token';
            this.logger.debug(`[JwtAuthGuard] Optional token parsing failed: ${msg}`);
          }
        }
      }
      return true;
    }

    if (!token) throw new UnauthorizedException('Missing authorization token');

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
        stationId: payload.stationId ?? null,
        stationIds: payload.stationIds ?? [],
      } satisfies AuthenticatedUser;

      // Forward correlation-id from Kong header
      const correlationId = request.headers['x-correlation-id'];
      if (correlationId) request.correlationId = correlationId;

      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Invalid token';
      this.logger.warn(`[JwtAuthGuard] Token rejected: ${msg}`);
      throw new UnauthorizedException(msg);
    }
  }

  private extractToken(request: { headers: Record<string, string> }): string | null {
    const auth = request.headers?.authorization;
    return auth?.startsWith('Bearer ') ? auth.slice(7).trim() : null;
  }
}
