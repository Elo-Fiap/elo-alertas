import { VALIDADE_PADRAO_MIN } from './aplicacao/listarAvisos.js';
import { montarApp } from './http/app.js';
import { criarPrisma } from './infra/prisma/cliente.js';
import { AvisosPrisma, LeiturasPrisma, ReguasPrisma } from './infra/prisma/repositorios.js';
import { FonteInmet, URL_INMET_PADRAO } from './infra/inmet.js';

function lerNumero(nome: string, padrao: number): number {
  const bruto = process.env[nome];
  if (bruto === undefined || bruto === '') return padrao;
  const n = Number(bruto);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`${nome} deve ser um número maior que zero (recebido "${bruto}").`);
  return n;
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error('Defina DATABASE_URL (copie .env.example para .env).');
  }
  const porta = lerNumero('PORTA', 3040);
  const validadeAvisosMin = lerNumero('AVISOS_VALIDADE_MIN', VALIDADE_PADRAO_MIN);

  const prisma = criarPrisma();
  const app = await montarApp({
    reguas: new ReguasPrisma(prisma),
    leituras: new LeiturasPrisma(prisma),
    avisos: new AvisosPrisma(prisma),
    fonteDeAvisos: new FonteInmet(process.env.INMET_URL || URL_INMET_PADRAO),
    verificarBanco: async () => {
      await prisma.$queryRaw`SELECT 1`;
    },
    validadeAvisosMin,
    logger: { level: 'info' },
  });

  const encerrar = async (): Promise<void> => {
    await app.close();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGINT', () => void encerrar());
  process.on('SIGTERM', () => void encerrar());

  await app.listen({ port: porta, host: '0.0.0.0' });
}

main().catch((erro: unknown) => {
  console.error(erro instanceof Error ? erro.message : erro);
  process.exit(1);
});
