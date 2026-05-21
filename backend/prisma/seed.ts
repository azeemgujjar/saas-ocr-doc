import { PrismaClient, UserRole, UserStatus, TenantStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

// Seeds a demo tenant + admin so you can log in right after `docker compose up`.
// Credentials: tenant=demo, admin@demo.com / Demo1234!
async function main() {
  const passwordHash = await bcrypt.hash('Demo1234!', 12);

  const tenant = await prisma.tenant.upsert({
    where: { slug: 'demo' },
    create: {
      name: 'Demo Tenant',
      slug: 'demo',
      status: TenantStatus.ACTIVE,
    },
    update: {},
  });

  await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: 'admin@demo.com' } },
    create: {
      tenantId: tenant.id,
      email: 'admin@demo.com',
      passwordHash,
      fullName: 'Demo Admin',
      role: UserRole.OWNER,
      status: UserStatus.ACTIVE,
    },
    update: {},
  });

  // eslint-disable-next-line no-console
  console.log('Seed complete. Login with tenantSlug=demo email=admin@demo.com password=Demo1234!');
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
