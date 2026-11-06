import { readFileSync } from 'node:fs';
import type { FastifyInstance } from 'fastify';
import { montarApp } from '../../src/http/app.js';
import { criarPrisma, type PrismaClient } from '../../src/infra/prisma/cliente.js';
import { AvisosPrisma, LeiturasPrisma, ReguasPrisma } from '../../src/infra/prisma/repositorios.js';
import { hashDaChave } from '../../src/dominio/regua.js';
import type { FonteDeAvisos } from '../../src/dominio/portas.js';

export const CHAVE = 'chave-de-teste';
export const fixtureInmet: unknown = JSON.parse(
  readFileSync(new URL('../fixtures/inmet-ativos.json', import.meta.url), 'utf8'),
);

/** Fonte falsa: nada de rede em teste. Conta as chamadas e pode falhar sob comando. */
export class FonteFalsa implements FonteDeAvisos {
  chamadas = 0;
  falhar = false;
  async baixar(): Promise<unknown> {
    this.chamadas += 1;
    if (this.falhar) throw new Error('INMET fora do ar (simulado)');
    return fixtureInmet;
  }
}

export interface Ambiente {
  app: FastifyInstance;
  prisma: PrismaClient;
  fonte: FonteFalsa;
  fechar: () => Promise<void>;
}

export async function criarAmbiente(
  opcoes: { verificarBanco?: () => Promise<void>; agora?: () => Date } = {},
): Promise<Ambiente> {
  const prisma = criarPrisma();
  const fonte = new FonteFalsa();
  await prisma.$executeRawUnsafe('TRUNCATE leituras, avisos, sincronizacoes, reguas RESTART IDENTITY CASCADE');
  await prisma.regua.createMany({
    data: [
      { id: 'regua-exemplo', local: 'Córrego de teste', limiteMetros: 1.2, alturaSensorMetros: 3, chaveHash: hashDaChave(CHAVE) },
      { id: 'regua-b', local: 'Outro ponto', limiteMetros: 0.8, chaveHash: hashDaChave('outra-chave') },
    ],
  });
  const app = await montarApp({
    reguas: new ReguasPrisma(prisma),
    leituras: new LeiturasPrisma(prisma),
    avisos: new AvisosPrisma(prisma),
    fonteDeAvisos: fonte,
    verificarBanco: opcoes.verificarBanco ?? (async () => void (await prisma.$queryRaw`SELECT 1`)),
    validadeAvisosMin: 5,
    ...(opcoes.agora && { agora: opcoes.agora }),
  });
  return {
    app,
    prisma,
    fonte,
    fechar: async () => {
      await app.close();
      await prisma.$disconnect();
    },
  };
}
