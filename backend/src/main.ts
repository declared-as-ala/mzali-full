import { ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));

  const config = app.get(ConfigService);

  app.use(helmet());
  // BFF architecture: browsers never call this API directly — no CORS needed.
  app.setGlobalPrefix('api', { exclude: ['health', 'health/live', 'health/ready'] });
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.enableShutdownHooks();

  if (config.get<boolean>('SWAGGER_ENABLED')) {
    const doc = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('Mzali Commerce API')
        .setVersion('1.0')
        .addBearerAuth()
        .build(),
    );
    SwaggerModule.setup('docs', app, doc);
  }

  const port = config.getOrThrow<number>('PORT');
  await app.listen(port);
}

void bootstrap();
