import { Global, Module } from '@nestjs/common';
import { LocalStorageService, StorageService } from './storage.service';

// Binds StorageService to its implementation. Switch useClass to an S3
// version for production.
@Global()
@Module({
  providers: [
    {
      provide: StorageService,
      useClass: LocalStorageService,
    },
  ],
  exports: [StorageService],
})
export class StorageModule {}
