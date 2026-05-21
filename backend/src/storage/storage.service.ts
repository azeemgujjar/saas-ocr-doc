import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'fs';
import { createHash } from 'crypto';
import { extname, join } from 'path';
import { v4 as uuidv4 } from 'uuid';

export interface StoredFile {
  storagePath: string; // relative to the storage backend
  sizeBytes: number;
  checksumSha256: string;
}

// Storage backend interface. Callers depend on this, not the implementation,
// so moving from local disk to S3 later is a single binding change.
export abstract class StorageService {
  abstract save(
    tenantId: string,
    fileBuffer: Buffer,
    originalName: string,
  ): Promise<StoredFile>;

  abstract read(storagePath: string): Promise<Buffer>;

  abstract delete(storagePath: string): Promise<void>;
}

// Local-disk storage. Files land at <UPLOAD_DIR>/<tenantId>/<uuid><ext> —
// the tenant prefix keeps isolation going down to the filesystem.
// Production would use S3 (SSE + per-tenant IAM scoping).
@Injectable()
export class LocalStorageService extends StorageService {
  private readonly logger = new Logger(LocalStorageService.name);
  private readonly baseDir: string;

  constructor(private readonly config: ConfigService) {
    super();
    this.baseDir = this.config.get<string>('upload.dir', './uploads');
  }

  async save(
    tenantId: string,
    fileBuffer: Buffer,
    originalName: string,
  ): Promise<StoredFile> {
    const ext = extname(originalName).toLowerCase().slice(0, 10);
    const safeFilename = `${uuidv4()}${ext}`;
    const tenantDir = join(this.baseDir, tenantId);
    const fullPath = join(tenantDir, safeFilename);

    await fs.mkdir(tenantDir, { recursive: true });
    await fs.writeFile(fullPath, fileBuffer);

    const checksum = createHash('sha256').update(fileBuffer).digest('hex');

    this.logger.log(
      `Stored file tenant=${tenantId} path=${tenantId}/${safeFilename} size=${fileBuffer.length}`,
    );

    return {
      storagePath: `${tenantId}/${safeFilename}`,
      sizeBytes: fileBuffer.length,
      checksumSha256: checksum,
    };
  }

  async read(storagePath: string): Promise<Buffer> {
    // reject path traversal
    if (storagePath.includes('..') || storagePath.startsWith('/')) {
      throw new Error('Invalid storage path');
    }
    return fs.readFile(join(this.baseDir, storagePath));
  }

  async delete(storagePath: string): Promise<void> {
    if (storagePath.includes('..') || storagePath.startsWith('/')) {
      throw new Error('Invalid storage path');
    }
    await fs.unlink(join(this.baseDir, storagePath)).catch(() => undefined);
  }
}
