import './tracing';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

const SERVICE_NAME = 'auth-service';
const DEFAULT_PORT = 3001;

process.on('uncaughtException', err => {
  console.error(`[${SERVICE_NAME}] UNCAUGHT EXCEPTION:`, err);
});
process.on('unhandledRejection', (reason) => {
  console.error(`[${SERVICE_NAME}] UNHANDLED REJECTION:`, reason);
});

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.enableShutdownHooks();

  app.use((req, res, next) => {
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
    transformOptions: { enableImplicitConversion: true },
  }));

  app.enableCors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') ?? '*',
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-Trace-ID', 'ngrok-skip-browser-warning'],
  });

  app.setGlobalPrefix('api/v1');

  if (process.env.NODE_ENV !== 'production' || process.env.SWAGGER_ENABLED === 'true') {
    const config = new DocumentBuilder()
      .setTitle('Auth Service API')
      .setDescription('Identity & Access Management -- Login, Register, Refresh Token, and Session Management')
      .setVersion('1.0')
      .addTag('Authentication', 'Login / Logout / Refresh Token operations')
      .addTag('OTP', 'One-Time Password verification via SMS/Phone')
      .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'jwt')
      .addServer(`http://localhost:${process.env.PORT ?? DEFAULT_PORT}`, 'Local Dev')
      .addServer('http://localhost:8000/api/v1', 'Kong Gateway')
      .build();
    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config), {
      swaggerOptions: { persistAuthorization: true, displayRequestDuration: true },
    });
  }

  app.getHttpAdapter().get('/health', (_req, res) => {
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
