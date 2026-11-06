import { PrismaClient } from '@prisma/client';
import { hashDaChave } from '../src/dominio/regua.js';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const chave = process.env.CHAVE_REGUA_EXEMPLO;
  if (!chave) {
    throw new Error('Defina CHAVE_REGUA_EXEMPLO no .env (veja .env.example) antes de rodar o seed.');
  }

  await prisma.regua.upsert({
    where: { id: 'regua-exemplo' },
    update: { chaveHash: hashDaChave(chave) },
    create: {
      id: 'regua-exemplo',
      local: 'Córrego do bairro de exemplo',
      limiteMetros: 1.2,
      alturaSensorMetros: 3.0,
      chaveHash: hashDaChave(chave),
    },
  });

  if (chave === 'troque-esta-chave-de-exemplo') {
    console.warn('Atenção: CHAVE_REGUA_EXEMPLO ainda é a do .env.example. Serve para testar no seu computador, nunca num servidor público.');
  }

  // ~12 leituras fictícias da última hora (uma a cada 5 min), subindo devagar.
  // Só entram com a régua sem leitura nenhuma: rodar o seed de novo não apaga leituras do ESP32.
  if ((await prisma.leitura.count({ where: { reguaId: 'regua-exemplo' } })) > 0) {
    console.log('Seed pronto: regua-exemplo já tinha leituras, nenhuma foi apagada nem criada.');
    return;
  }
  const agora = Date.now();
  const niveis = [0.42, 0.44, 0.45, 0.49, 0.55, 0.61, 0.68, 0.74, 0.81, 0.86, 0.9, 0.93];
  await prisma.leitura.createMany({
    data: niveis.map((nivel, i) => {
      const medidaEm = new Date(agora - (niveis.length - 1 - i) * 5 * 60_000);
      return {
        reguaId: 'regua-exemplo',
        nivelMetros: nivel,
        medidaEm,
        recebidaEm: medidaEm,
        bateriaPercentual: 90 - Math.floor(i / 4),
      };
    }),
  });
  console.log(`Seed pronto: regua-exemplo com ${niveis.length} leituras.`);
}

main()
  .catch((erro: unknown) => {
    console.error(erro instanceof Error ? erro.message : erro);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
