import { PrismaClient } from '~/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { env } from '~/lib/env.server';
import { onShutdown } from '~/lib/shutdown.server';

const globalForPrisma = global as unknown as {
    prisma: PrismaClient;
};

const adapter = new PrismaPg({
    connectionString: env.DATABASE_URL,
});

const prisma =
    globalForPrisma.prisma ||
    new PrismaClient({
        adapter,
    });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

onShutdown(() => prisma.$disconnect());

export default prisma;
