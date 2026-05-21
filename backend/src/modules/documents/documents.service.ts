import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bullmq';
import { DocumentStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';
import { PROCESSING_QUEUE, PROCESS_DOCUMENT_JOB } from '../processing/processing.constants';
import { ListDocumentsQueryDto } from './dto/upload-document.dto';

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    @InjectQueue(PROCESSING_QUEUE) private readonly processingQueue: Queue,
  ) {}

  // Stores the file, creates the Document row as PENDING, and queues a job.
  // Returns straight away — the worker does the actual processing.
  async upload(
    tenantId: string,
    userId: string,
    file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    // Multer/ParseFilePipe already checked the declared mime type, but a
    // client can lie about that — so also sniff the actual first bytes.
    if (!this.magicBytesMatchMime(file.buffer, file.mimetype)) {
      throw new BadRequestException(
        'File content does not match declared type',
      );
    }

    const stored = await this.storage.save(
      tenantId,
      file.buffer,
      file.originalname,
    );

    const tenantDb = this.prisma.forTenant(tenantId);
    const document = await tenantDb.document.create({
      data: {
        originalName: file.originalname,
        storagePath: stored.storagePath,
        mimeType: file.mimetype,
        sizeBytes: stored.sizeBytes,
        checksumSha256: stored.checksumSha256,
        status: DocumentStatus.PENDING,
        uploadedById: userId,
      } as any,  // tenantId injected by the Prisma tenant extension
    });

    await this.processingQueue.add(
      PROCESS_DOCUMENT_JOB,
      { documentId: document.id, tenantId },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: { age: 3600, count: 1000 },
        removeOnFail: { age: 86400 },
      },
    );

    this.logger.log(
      `Document queued tenant=${tenantId} doc=${document.id} size=${stored.sizeBytes}`,
    );

    return document;
  }

  async list(tenantId: string, query: ListDocumentsQueryDto) {
    const tenantDb = this.prisma.forTenant(tenantId);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const where = query.status ? { status: query.status } : {};

    const [items, total] = await Promise.all([
      tenantDb.document.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      tenantDb.document.count({ where }),
    ]);

    return {
      items,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async findOne(tenantId: string, id: string) {
    const tenantDb = this.prisma.forTenant(tenantId);
    const doc = await tenantDb.document.findUnique({ where: { id } });
    if (!doc) throw new NotFoundException('Document not found');
    return doc;
  }

  // Checks the file's magic bytes against its declared mime type so an
  // attacker can't upload, say, an executable renamed to .pdf.
  // TODO: swap this hand-rolled check for the `file-type` package.
  private magicBytesMatchMime(buffer: Buffer, mime: string): boolean {
    if (buffer.length < 4) return false;
    const head = buffer.subarray(0, 8);
    const hex = head.toString('hex').toLowerCase();

    switch (mime) {
      case 'application/pdf':
        // %PDF-
        return head.subarray(0, 4).toString() === '%PDF';
      case 'image/jpeg':
        return hex.startsWith('ffd8ff');
      case 'image/png':
        return hex.startsWith('89504e470d0a1a0a');
      case 'image/webp':
        return (
          head.subarray(0, 4).toString() === 'RIFF' &&
          head.subarray(0, 12).length >= 12
        );
      default:
        return false;
    }
  }
}
