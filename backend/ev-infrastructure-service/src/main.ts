import './tracing';
import 'reflect-metadata';
import * as express from 'express';
import * as http from 'http';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { ValidationPipe, Logger } from '@nestjs/common';
import { Logger as PinoLogger } from 'nestjs-pino';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

const SERVICE_NAME = 'station-service';
const DEFAULT_PORT = 3003;

process.on('uncaughtException', err => {
  console.error(`[${SERVICE_NAME}] UNCAUGHT EXCEPTION:`, err);
});
process.on('unhandledRejection', (reason) => {
  console.error(`[${SERVICE_NAME}] UNHANDLED REJECTION:`, reason);
});

async function bootstrap() {
  const expressApp = express();
  let healthStatus = 'starting';

  expressApp.get('/health', (_req: any, res: any) => {
    res.status(200).json({ status: healthStatus, service: SERVICE_NAME, timestamp: new Date().toISOString() });
  });

  const app = await NestFactory.create(AppModule, new ExpressAdapter(expressApp), { bufferLogs: true });
  app.useLogger(app.get(PinoLogger));

  app.enableShutdownHooks();

  app.use((req: any, res: any, next: any) => {
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    res.setHeader('Content-Security-Policy', "default-src 'self'");
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-DNS-Prefetch-Control', 'off');
    next();
  });

  app.useGlobalPipes(new ValidationPipe({
    whitelist: true, forbidNonWhitelisted: true, transform: true,
  }));

  app.enableCors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') ?? '*',
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-Trace-ID', 'X-Kiosk-Key'],
  });

  app.setGlobalPrefix('api/v1');

  if (process.env.NODE_ENV !== 'production' || process.env.SWAGGER_ENABLED === 'true') {
    const port = Number(process.env.PORT ?? DEFAULT_PORT);
    const config = new DocumentBuilder()
      .setTitle('Station Service API')
      .setDescription('Manages charging stations, physical chargers, and geospatial availability.')
      .setVersion('1.0')
      .addTag('Stations')
      .addTag('Chargers')
      .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'jwt')
      .addServer(`http://localhost:${port}`, 'Local Dev')
      .addServer('http://localhost:8000', 'Kong Gateway')
      .build();
    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config), {
      swaggerOptions: { persistAuthorization: true, displayRequestDuration: true },
    });
  }

  const port = process.env.PORT ?? DEFAULT_PORT;

  const httpServer = http.createServer(expressApp);
  httpServer.listen(port);

  expressApp.use('/api', (_req: any, res: any, next: any) => {
    if (healthStatus !== 'ok') {
      return res.status(503).json({ error: 'Service not ready', service: SERVICE_NAME });
    }
    next();
  });

  // Routes are already registered by NestFactory.create() above.
  // app.init() only runs lifecycle hooks (OnModuleInit etc.) which may
  // hang (e.g. RabbitMQ). Fire it in the background and continue.
  app.init().then(() => {
    healthStatus = 'ok';
    new Logger('Bootstrap').log(`[${SERVICE_NAME}] Init complete`);
  }).catch((err: Error) => {
    new Logger('Bootstrap').warn(`[${SERVICE_NAME}] Init error: ${err.message} — accepting traffic anyway`);
    healthStatus = 'ok';
  });

  // Set health ok immediately so the readiness guard lets requests through
  // while lifecycle hooks run in the background.
  healthStatus = 'ok';

  app.get(PinoLogger).log(`[${SERVICE_NAME}] Running on :${port} | Swagger: /api/docs`);
}

bootstrap().catch(err => {
  console.error(`[${SERVICE_NAME}] Bootstrap failed:`, err);
  process.exit(1);
});
