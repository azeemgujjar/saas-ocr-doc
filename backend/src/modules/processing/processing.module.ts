import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { PROCESSING_QUEUE } from './processing.constants';
import { ProcessingProcessor } from './processing.processor';

// API and worker share this module. Both register the queue (so the API can
// enqueue), but only the worker registers the processor — otherwise the API
// would consume jobs too. APP_ROLE=worker is set on the worker container.
const isWorker = process.env.APP_ROLE === 'worker';

@Module({
  imports: [
    BullModule.registerQueue({
      name: PROCESSING_QUEUE,
      defaultJobOptions: {
        removeOnComplete: { age: 3600, count: 1000 },
        removeOnFail: { age: 86400 },
      },
    }),
  ],
  providers: isWorker ? [ProcessingProcessor] : [],
  exports: [BullModule],
})
export class ProcessingModule {}
