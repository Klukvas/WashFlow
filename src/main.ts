import './instrument';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Logger as PinoLogger } from 'nestjs-pino';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { PrismaExceptionFilter } from './common/filters/prisma-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    rawBody: true,
  });
  app.useLogger(app.get(PinoLogger));
  const config = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  app.setGlobalPrefix('api/v1');

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", 'https://cdn.paddle.com'],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'blob:'],
          connectSrc: [
            "'self'",
            'https://*.paddle.com',
            'https://*.sentry.io',
            'wss:',
            'ws:',
          ],
          frameSrc: ["'self'", 'https://*.paddle.com'],
          fontSrc: ["'self'"],
        },
      },
    }),
  );
  app.use(cookieParser());
  // CSRF protection is not required: this is a stateless JSON API using JWT
  // Bearer tokens for authentication. Refresh tokens are stored in httpOnly
  // cookies with sameSite=lax|strict, which prevents cross-origin cookie
  // submission. No server-rendered HTML forms are served.
  app.useStaticAssets(join(__dirname, '..', 'uploads'), { prefix: '/uploads' });

  const corsOrigins = config.get<string>('corsOrigins', '*');
  const nodeEnv = config.get<string>('nodeEnv', 'development');
  if (nodeEnv === 'production' && corsOrigins === '*') {
    logger.error('CORS_ORIGINS must not be "*" in production. Exiting.');
    app.flushLogs();
    process.exit(1);
  }
  app.enableCors({
    origin: corsOrigins === '*' ? true : corsOrigins.split(','),
    credentials: true,
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'x-carwash-tenant-id',
      'idempotency-key',
    ],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.useGlobalFilters(
    new AllExceptionsFilter(config),
    new PrismaExceptionFilter(),
  );
  app.useGlobalInterceptors(new TransformInterceptor());

  app.enableShutdownHooks();

  if (nodeEnv !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('WashFlow API')
      .setDescription('Car wash management platform API')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
    logger.log('Swagger UI available at /api/docs');
  }

  const port = config.get<number>('port', 3000);

  const server = app.getHttpServer();
  server.setTimeout(30_000); // 30s request timeout

  await app.listen(port);

  logger.log(`Application running on port ${port}`);
}

bootstrap().catch((err) => {
  console.error('Failed to start application:', err);
  process.exit(1);
});
