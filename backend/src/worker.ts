import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';

// Worker entry point. Same Nest app context as the API, but no HTTP listener —
// the @Processor() consumers start pulling jobs once the context is up.
async function bootstrapWorker() {
  const logger = new Logger('Worker');
  const app = await NestFactory.createApplicationContext(AppModule, {
    bufferLogs: false,
  });
  app.enableShutdownHooks();
  logger.log('Worker started, consuming queues');
}

bootstrapWorker().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Worker bootstrap failed:', err);
  process.exit(1);
});
