import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { PROCESSING_QUEUE } from '../processing/processing.constants';

@Module({
  imports: [
    BullModule.registerQueue({
      name: PROCESSING_QUEUE,
    }),
  ],
  controllers: [DocumentsController],
  providers: [DocumentsService],
  exports: [DocumentsService],
})
export class DocumentsModule {}
