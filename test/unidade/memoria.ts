import type { Aviso } from '../../src/dominio/aviso.js';
import type {
  FonteDeAvisos,
  RepositorioAvisos,
  RepositorioLeituras,
  RepositorioReguas,
} from '../../src/dominio/portas.js';
import { hashDaChave, type Leitura, type Regua } from '../../src/dominio/regua.js';

export class ReguasEmMemoria implements RepositorioReguas {
  constructor(private readonly reguas: Regua[] = []) {}
  async buscarPorId(id: string) {
    return this.reguas.find((r) => r.id === id) ?? null;
  }
  async listar(filtro: { codigoIbge?: string } = {}) {
    return this.reguas
      .filter((r) => filtro.codigoIbge === undefined || r.codigoIbge === filtro.codigoIbge)
      .sort((a, b) => a.id.localeCompare(b.id));
  }
}

export class LeiturasEmMemoria implements RepositorioLeituras {
  readonly itens: Leitura[] = [];
  async registrar(leitura: Leitura) {
    this.itens.push(leitura);
  }
  async ultima(reguaId: string) {
    // Igual ao Prisma: a última que chegou, não a de medidaEm mais alta.
    return this.itens.filter((l) => l.reguaId === reguaId).at(-1) ?? null;
  }
  async historico(reguaId: string, desde: Date, limite: number) {
    return this.doRegua(reguaId)
      .filter((l) => l.medidaEm >= desde)
      .slice(0, limite);
  }
  private doRegua(reguaId: string) {
    return this.itens.filter((l) => l.reguaId === reguaId).sort((a, b) => b.medidaEm.getTime() - a.medidaEm.getTime());
  }
}

export class AvisosEmMemoria implements RepositorioAvisos {
  avisos: Aviso[] = [];
  sincronizacoes: Array<{ feitaEm: Date; sucesso: boolean; quantidade: number; erro: string | null }> = [];

  async substituirTodos(avisos: Aviso[], feitaEm: Date) {
    this.avisos = avisos;
    this.sincronizacoes.push({ feitaEm, sucesso: true, quantidade: avisos.length, erro: null });
  }
  async registrarFalha(erro: string, feitaEm: Date) {
    this.sincronizacoes.push({ feitaEm, sucesso: false, quantidade: 0, erro });
  }
  async ultimaSincronizacaoComSucesso() {
    return this.sincronizacoes.filter((s) => s.sucesso).at(-1)?.feitaEm ?? null;
  }
  async buscarPorMunicipio(codigoIbge: string) {
    return this.avisos.filter((a) => a.municipios.includes(codigoIbge));
  }
}

/** Fonte falsa: devolve o JSON dado, ou lança o erro dado. Conta as chamadas. */
export class FonteFalsa implements FonteDeAvisos {
  chamadas = 0;
  constructor(public resposta: unknown | Error) {}
  async baixar() {
    this.chamadas += 1;
    if (this.resposta instanceof Error) throw this.resposta;
    return this.resposta;
  }
}

export function reguaDeTeste(chave = 'chave-secreta'): Regua {
  return {
    id: 'regua-1',
    local: 'Córrego',
    limiteMetros: 1.2,
    alturaSensorMetros: 3,
    atencaoMetros: null,
    ruaId: null,
    codigoIbge: null,
    latitude: null,
    longitude: null,
    chaveHash: hashDaChave(chave),
  };
}
