import { defineConfig } from 'vitest/config';

// Testes de unidade: domínio e casos de uso, sem banco e sem rede.
export default defineConfig({
  test: {
    include: ['test/unidade/**/*.test.ts'],
    environment: 'node',
  },
});
