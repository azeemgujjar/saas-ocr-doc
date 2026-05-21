import { NestFactory } from '@nestjs/core';
import { ValidationPipe, VersioningType, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';

// HTTP API entry point. The worker runs from worker.ts instead.
async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: false,
  });
  const config = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  app.use(helmet());

  app.enableCors({
    origin: config.get<string[]>('cors.origins'),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  // URI versioning -> /api/v1/...
  const apiPrefix = config.get<string>('apiPrefix', 'api');
  const apiVersion = config.get<string>('apiVersion', 'v1');
  app.setGlobalPrefix(apiPrefix);
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: apiVersion.replace(/^v/, ''),
    prefix: 'v',
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,            // strip unknown props
      forbidNonWhitelisted: true, // reject if unknown props present
      transform: true,            // auto-convert primitives + DTO instances
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const swagger = new DocumentBuilder()
    .setTitle('IDP SaaS API')
    .setDescription(
      'Multi-tenant Intelligent Document Processing API. ' +
      'Authenticate with `POST /auth/login`, then send `Authorization: Bearer <accessToken>`.',
    )
    .setVersion(apiVersion)
    .addBearerAuth()
    .addServer(`http://localhost:${config.get<number>('port', 3001)}`)
    .build();
  const swaggerDoc = SwaggerModule.createDocument(app, swagger);
  SwaggerModule.setup(`${apiPrefix}/docs`, app, swaggerDoc, {
    swaggerOptions: { persistAuthorization: true },
  });

  app.enableShutdownHooks();

  const port = config.get<number>('port', 3001);
  await app.listen(port, '0.0.0.0');
  logger.log(`API listening on http://0.0.0.0:${port}`);
  logger.log(`Swagger docs at  http://0.0.0.0:${port}/${apiPrefix}/docs`);
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal bootstrap error:', err);
  process.exit(1);
});
