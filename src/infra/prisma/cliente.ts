import { PrismaClient } from '@prisma/client';

export function criarPrisma(databaseUrl?: string): PrismaClient {
  return new PrismaClient(databaseUrl ? { datasourceUrl: databaseUrl } : undefined);
}

export type { PrismaClient };
