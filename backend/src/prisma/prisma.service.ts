import { Injectable, OnModuleDestroy, OnModuleInit, Logger } from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';

/**
 * PrismaClient plus a `forTenant(tenantId)` helper that returns a client
 * scoped to one tenant — reads get `tenantId` added to the where clause,
 * writes get it added to the data. This is how tenant isolation is enforced
 * without trusting every handler to remember the filter.
 *
 *   const tenantDb = this.prisma.forTenant(tenantId);
 *   await tenantDb.document.findMany();
 *
 * Use plain `this.prisma` for things that aren't tenant-scoped (creating a
 * tenant at registration, JWT validation lookups, etc).
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'event', level: 'error' },
        { emit: 'event', level: 'warn' },
      ],
    });
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('Prisma connected');
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  forTenant(tenantId: string) {
    if (!tenantId) {
      throw new Error('forTenant() requires a non-empty tenantId');
    }

    // models that have a tenantId column — keep this in sync with schema.prisma
    const tenantScopedModels = ['user', 'apiKey', 'document'] as const;

    return this.$extends({
      name: 'tenant-scope',
      query: {
        $allModels: {
          async $allOperations(params: any) {
            const { model, operation, args, query } = params;
            if (!model) return query(args);
            const modelKey = model.charAt(0).toLowerCase() + model.slice(1);
            if (!tenantScopedModels.includes(modelKey as any)) {
              return query(args);
            }

            // `args` is a union of every operation's arg shape; cast so we
            // can mutate `where`/`data` without TS narrowing per-operation.
            const a = args as any;

            // Read operations: inject tenantId into the where clause
            if (
              [
                'findUnique',
                'findUniqueOrThrow',
                'findFirst',
                'findFirstOrThrow',
                'findMany',
                'count',
                'aggregate',
                'groupBy',
              ].includes(operation)
            ) {
              a.where = { ...(a.where ?? {}), tenantId };
              return query(args);
            }

            // Single-row creates: inject tenantId into data
            if (operation === 'create' || operation === 'upsert') {
              if (operation === 'create') {
                a.data = { ...(a.data ?? {}), tenantId };
              } else {
                // upsert
                a.where = { ...(a.where ?? {}), tenantId };
                a.create = { ...(a.create ?? {}), tenantId };
              }
              return query(args);
            }

            // Bulk create: inject tenantId into each row
            if (operation === 'createMany') {
              const data = Array.isArray(a.data) ? a.data : [a.data];
              a.data = data.map((row: any) => ({ ...row, tenantId }));
              return query(args);
            }

            // Updates and deletes: scope by tenantId
            if (
              ['update', 'updateMany', 'delete', 'deleteMany'].includes(operation)
            ) {
              a.where = { ...(a.where ?? {}), tenantId };
              // Block any attempt to update tenantId itself
              if (a.data && 'tenantId' in a.data) {
                delete a.data.tenantId;
              }
              return query(args);
            }

            return query(args);
          },
        },
      },
    });
  }
}
