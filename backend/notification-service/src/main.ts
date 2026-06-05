import './tracing';
import 'reflect-metadata';
import * as http from 'http';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

const SERVICE_NAME = 'notification-service';
const DEFAULT_PORT = 3008;

let healthServer: http.Server | null = null;

function startMinimalHealthServer(port: number) {
  healthServer = http.createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'starting', service: SERVICE_NAME }));
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  healthServer.listen(port);
}

function stopHealthServer(): Promise<void> {
  return new Promise(resolve => {
    if (healthServer) {
      healthServer.close(() => { healthServer = null; resolve(); });
    } else {
      resolve();
    }
  });
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableShutdownHooks();

  app.useGlobalPipes(new ValidationPipe({
    whitelist: true, forbidNonWhitelisted: true, transform: true,
    transformOptions: { enableImplicitConversion: true },
  }));

  app.enableCors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') ?? '*',
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-Trace-ID', 'ngrok-skip-browser-warning'],
  });

  app.setGlobalPrefix('api/v1');

  if (process.env.NODE_ENV !== 'production' || process.env.SWAGGER_ENABLED === 'true') {
    const port = Number(process.env.PORT ?? DEFAULT_PORT);
    const config = new DocumentBuilder()
      .setTitle('Notification Service API')
      .setDescription('Centralized service for Push Notifications, SMS, and Email delivery.')
      .setVersion('1.0')
      .addTag('Notifications')
      .addTag('FCM')
      .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'jwt')
      .addServer(`http://localhost:${port}`, 'Local Dev')
      .addServer('http://localhost:8000', 'Kong Gateway')
      .build();
    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config), {
      swaggerOptions: { persistAuthorization: true, displayRequestDuration: true },
    });
  }

  app.getHttpAdapter().get('/health', (_req: any, res: any) => {
    res.status(200).json({ status: 'ok', service: SERVICE_NAME, timestamp: new Date().toISOString() });
  });

  const port = process.env.PORT ?? DEFAULT_PORT;
  await stopHealthServer();
  await app.listen(port);
  new Logger('Bootstrap').log(`[${SERVICE_NAME}] Running on :${port} | Swagger: /api/docs`);
}

async function start() {
  const port = Number(process.env.PORT ?? DEFAULT_PORT);
  startMinimalHealthServer(port);

  const MAX_RETRIES = 5;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await bootstrap();
      return;
    } catch (err) {
      console.error(`[${SERVICE_NAME}] Bootstrap attempt ${attempt}/${MAX_RETRIES} failed:`, err);
      if (attempt < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, Math.min(attempt * 2000, 10000)));
      }
    }
  }

  console.error(`[${SERVICE_NAME}] All ${MAX_RETRIES} attempts failed. Running degraded with background retries.`);
  (async function backgroundRetry() {
    while (true) {
      await new Promise(r => setTimeout(r, 30000));
      try {
        await bootstrap();
        return;
      } catch (err) {
        console.warn(`[${SERVICE_NAME}] Background retry failed:`, (err as Error).message);
      }
    }
  })();
}

start();
