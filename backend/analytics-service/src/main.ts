import './tracing';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

const SERVICE_NAME = 'analytics-service';
const DEFAULT_PORT = 3002;

process.on('uncaughtException', err => {
  console.error(`[${SERVICE_NAME}] UNCAUGHT EXCEPTION:`, err);
});
process.on('unhandledRejection', (reason) => {
  console.error(`[${SERVICE_NAME}] UNHANDLED REJECTION:`, reason);
});

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

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
      .setTitle('Analytics Service API')
      .setDescription('Provides system-wide KPIs, revenue reports, and user behavior analysis.')
      .setVersion('1.0')
      .addTag('Analytics')
      .addTag('Reports')
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
  await app.listen(port);
  new Logger('Bootstrap').log(`[${SERVICE_NAME}] Running on :${port} | Swagger: /api/docs`);
}

bootstrap().catch(err => {
  console.error(`[${SERVICE_NAME}] Bootstrap failed:`, err);
  process.exit(1);
});
