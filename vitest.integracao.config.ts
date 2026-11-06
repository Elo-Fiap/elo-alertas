import { defineConfig } from 'vitest/config';

// Banco de teste separado do de desenvolvimento, no mesmo Postgres do compose (porta 54340).
export const URL_TESTE = 'postgresql://elo:elo_local@localhost:54340/elo_alertas_teste?schema=public';

// Testes de integração: Postgres real do docker compose (banco elo_alertas_teste), um arquivo por vez.
export default defineConfig({
  test: {
    include: ['test/integracao/**/*.test.ts'],
    environment: 'node',
    globalSetup: ['test/integracao/preparar-banco.ts'],
    fileParallelism: false,
    maxWorkers: 2,
    env: { DATABASE_URL: URL_TESTE },
    testTimeout: 15_000,
    hookTimeout: 60_000,
  },
});
