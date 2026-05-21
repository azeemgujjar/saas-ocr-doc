import { Process, Processor, OnQueueActive, OnQueueFailed, OnQueueCompleted } from '@nestjs/bull';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';
import { PROCESSING_QUEUE, PROCESS_DOCUMENT_JOB } from './processing.constants';

interface ProcessDocumentJobData {
  documentId: string;
  tenantId: string;
}

// What gets written to document.extractedData.
interface OcrResult {
  text: string;
  language: string;
  confidence: number;
  pageCount: number;
  wordCount: number;
  durationMs?: number;
}

/**
 * Consumes the document-processing queue: reads the file from storage, sends
 * it to the OCR service, and writes back the extracted text + metadata.
 *
 * Retries (3 attempts, exponential backoff) are set when the job is enqueued
 * in DocumentsService. Status moves PENDING -> PROCESSING -> COMPLETED|FAILED.
 * PDFs are failed outright since Tesseract can't read them.
 */
@Processor(PROCESSING_QUEUE)
export class ProcessingProcessor {
  private readonly logger = new Logger(ProcessingProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly storage: StorageService,
  ) {}

  @Process(PROCESS_DOCUMENT_JOB)
  async handleProcess(job: Job<ProcessDocumentJobData>) {
    const { documentId, tenantId } = job.data;
    const tenantDb = this.prisma.forTenant(tenantId);

    this.logger.log(
      `[job=${job.id} attempt=${job.attemptsMade + 1}] Processing doc=${documentId}`,
    );

    const document = await tenantDb.document.findUnique({
      where: { id: documentId },
    });
    if (!document) {
      throw new Error(`Document ${documentId} not found for tenant ${tenantId}`);
    }

    await tenantDb.document.update({
      where: { id: documentId },
      data: {
        status: DocumentStatus.PROCESSING,
        processingStartedAt: new Date(),
      },
    });

    // Tesseract can't read PDFs — fail it now rather than waste retries.
    // TODO: rasterize PDFs (poppler) and feed the pages through instead.
    if (document.mimeType === 'application/pdf') {
      await tenantDb.document.update({
        where: { id: documentId },
        data: {
          status: DocumentStatus.FAILED,
          errorMessage:
            'PDF OCR is not supported. Please upload an image (JPEG, PNG, or WebP).',
        },
      });
      this.logger.warn(
        `[job=${job.id}] Unsupported type doc=${documentId} mime=${document.mimeType}`,
      );
      return; // do NOT throw — this is a terminal, non-retryable outcome
    }

    try {
      const fileBuffer = await this.storage.read(document.storagePath);
      const extractedData = await this.runOcr(
        fileBuffer,
        document.originalName,
        document.mimeType,
      );

      await tenantDb.document.update({
        where: { id: documentId },
        data: {
          status: DocumentStatus.COMPLETED,
          processedAt: new Date(),
          extractedData: extractedData as any,
          errorMessage: null,
        },
      });

      this.logger.log(
        `[job=${job.id}] Completed doc=${documentId} ` +
          `words=${extractedData.wordCount} confidence=${extractedData.confidence}`,
      );
      return extractedData;
    } catch (err: any) {
      await tenantDb.document.update({
        where: { id: documentId },
        data: { retryCount: { increment: 1 } },
      });

      const isFinalAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
      if (isFinalAttempt) {
        await tenantDb.document.update({
          where: { id: documentId },
          data: {
            status: DocumentStatus.FAILED,
            errorMessage: err?.message ?? 'Processing failed',
          },
        });
        this.logger.error(`[job=${job.id}] FINAL FAIL doc=${documentId}: ${err?.message}`);
      } else {
        this.logger.warn(
          `[job=${job.id}] Attempt ${job.attemptsMade + 1} failed for doc=${documentId}: ${err?.message}. Will retry.`,
        );
      }
      throw err; // re-throw so BullMQ schedules the retry
    }
  }

  // POSTs the file to the OCR service. Throws on a non-2xx response or a
  // timeout so the BullMQ retry logic picks it up.
  private async runOcr(
    fileBuffer: Buffer,
    fileName: string,
    mimeType: string,
  ): Promise<OcrResult> {
    const baseUrl = this.config.get<string>('ocr.serviceUrl');
    const timeoutMs = this.config.get<number>('ocr.timeoutMs', 120000);

    const form = new FormData();
    // Wrap in a fresh Uint8Array so the Blob part satisfies the DOM typing
    // (a Node Buffer's backing store is typed as ArrayBufferLike, not ArrayBuffer).
    const blob = new Blob([new Uint8Array(fileBuffer)], { type: mimeType });
    form.append('file', blob, fileName);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${baseUrl}/ocr`, {
        method: 'POST',
        body: form,
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(
          `OCR service returned HTTP ${response.status}: ${body || response.statusText}`,
        );
      }

      return (await response.json()) as OcrResult;
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        throw new Error(`OCR service timed out after ${timeoutMs}ms`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  @OnQueueActive()
  onActive(job: Job) {
    this.logger.debug(`Active job=${job.id} name=${job.name}`);
  }

  @OnQueueCompleted()
  onComplete(job: Job) {
    this.logger.debug(`Completed job=${job.id}`);
  }

  @OnQueueFailed()
  onFailed(job: Job, err: Error) {
    this.logger.warn(`Failed job=${job.id} reason=${err.message}`);
  }
}
