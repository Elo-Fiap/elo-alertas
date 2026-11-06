import { Prisma, type PrismaClient, type Severidade as SeveridadePrisma } from '@prisma/client';
import type { Aviso, Severidade } from '../../dominio/aviso.js';
import type {
  RepositorioAvisos,
  RepositorioLeituras,
  RepositorioReguas,
} from '../../dominio/portas.js';
import type { Leitura, Regua } from '../../dominio/regua.js';

const PARA_PRISMA: Record<Severidade, SeveridadePrisma> = {
  'Perigo Potencial': 'PERIGO_POTENCIAL',
  Perigo: 'PERIGO',
  'Grande Perigo': 'GRANDE_PERIGO',
};

const DO_PRISMA: Record<SeveridadePrisma, Severidade> = {
  PERIGO_POTENCIAL: 'Perigo Potencial',
  PERIGO: 'Perigo',
  GRANDE_PERIGO: 'Grande Perigo',
};

const FONTE_INMET = 'inmet';

export class ReguasPrisma implements RepositorioReguas {
  constructor(private readonly prisma: PrismaClient) {}

  private paraDominio(r: {
    id: string;
    local: string;
    limiteMetros: Prisma.Decimal;
    alturaSensorMetros: Prisma.Decimal | null;
    chaveHash: string;
  }): Regua {
    return {
      id: r.id,
      local: r.local,
      limiteMetros: r.limiteMetros.toNumber(),
      alturaSensorMetros: r.alturaSensorMetros?.toNumber() ?? null,
      chaveHash: r.chaveHash,
    };
  }

  async buscarPorId(id: string): Promise<Regua | null> {
    const r = await this.prisma.regua.findUnique({ where: { id } });
    return r ? this.paraDominio(r) : null;
  }

  async listar(): Promise<Regua[]> {
    const todas = await this.prisma.regua.findMany({ orderBy: { id: 'asc' } });
    return todas.map((r) => this.paraDominio(r));
  }
}

export class LeiturasPrisma implements RepositorioLeituras {
  constructor(private readonly prisma: PrismaClient) {}

  private paraDominio(l: {
    reguaId: string;
    nivelMetros: Prisma.Decimal;
    medidaEm: Date;
    recebidaEm: Date;
    bateriaPercentual: number | null;
  }): Leitura {
    return {
      reguaId: l.reguaId,
      nivelMetros: l.nivelMetros.toNumber(),
      medidaEm: l.medidaEm,
      recebidaEm: l.recebidaEm,
      bateriaPercentual: l.bateriaPercentual,
    };
  }

  async registrar(leitura: Leitura): Promise<void> {
    await this.prisma.leitura.create({
      data: {
        reguaId: leitura.reguaId,
        nivelMetros: leitura.nivelMetros,
        medidaEm: leitura.medidaEm,
        recebidaEm: leitura.recebidaEm,
        bateriaPercentual: leitura.bateriaPercentual,
      },
    });
  }

  async ultima(reguaId: string): Promise<Leitura | null> {
    const l = await this.prisma.leitura.findFirst({ where: { reguaId }, orderBy: { medidaEm: 'desc' } });
    return l ? this.paraDominio(l) : null;
  }

  async historico(reguaId: string, desde: Date, limite: number): Promise<Leitura[]> {
    const ls = await this.prisma.leitura.findMany({
      where: { reguaId, medidaEm: { gte: desde } },
      orderBy: { medidaEm: 'desc' },
      take: limite,
    });
    return ls.map((l) => this.paraDominio(l));
  }
}

export class AvisosPrisma implements RepositorioAvisos {
  constructor(private readonly prisma: PrismaClient) {}

  async substituirTodos(avisos: Aviso[], feitaEm: Date): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.aviso.deleteMany(),
      this.prisma.aviso.createMany({
        data: avisos.map((a) => ({
          id: a.id,
          titulo: a.titulo,
          severidade: PARA_PRISMA[a.severidade],
          inicio: a.inicio,
          fim: a.fim,
          riscos: a.riscos,
          instrucoes: a.instrucoes,
          municipios: a.municipios,
          atualizadoEm: a.atualizadoEm,
        })),
      }),
      this.prisma.sincronizacao.create({
        data: { fonte: FONTE_INMET, feitaEm, sucesso: true, quantidade: avisos.length },
      }),
    ]);
  }

  async registrarFalha(erro: string, feitaEm: Date): Promise<void> {
    await this.prisma.sincronizacao.create({
      data: { fonte: FONTE_INMET, feitaEm, sucesso: false, quantidade: 0, erro: erro.slice(0, 500) },
    });
  }

  async ultimaSincronizacaoComSucesso(): Promise<Date | null> {
    const s = await this.prisma.sincronizacao.findFirst({
      where: { fonte: FONTE_INMET, sucesso: true },
      orderBy: { feitaEm: 'desc' },
    });
    return s?.feitaEm ?? null;
  }

  async buscarPorMunicipio(codigoIbge: string): Promise<Aviso[]> {
    const linhas = await this.prisma.aviso.findMany({ where: { municipios: { has: codigoIbge } } });
    return linhas.map((a) => ({ ...a, severidade: DO_PRISMA[a.severidade] }));
  }
}
