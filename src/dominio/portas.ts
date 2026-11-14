import type { Aviso } from './aviso.js';
import type { Leitura, Regua } from './regua.js';

/** Portas: o que o domínio e os casos de uso precisam do mundo de fora. A infra implementa. */

export interface RepositorioReguas {
  buscarPorId(id: string): Promise<Regua | null>;
  /** Todas as réguas, em ordem de id. Com `codigoIbge`, só as do município. */
  listar(filtro?: { codigoIbge?: string }): Promise<Regua[]>;
}

export interface RepositorioLeituras {
  registrar(leitura: Leitura): Promise<void>;
  ultima(reguaId: string): Promise<Leitura | null>;
  /** Leituras com medidaEm a partir de `desde`, da mais nova para a mais velha, até `limite`. */
  historico(reguaId: string, desde: Date, limite: number): Promise<Leitura[]>;
}

export interface RepositorioAvisos {
  /** Troca todos os avisos pelos novos e registra a sincronização com sucesso, numa transação. */
  substituirTodos(avisos: Aviso[], feitaEm: Date): Promise<void>;
  registrarFalha(erro: string, feitaEm: Date): Promise<void>;
  ultimaSincronizacaoComSucesso(): Promise<Date | null>;
  buscarPorMunicipio(codigoIbge: string): Promise<Aviso[]>;
}

/** De onde vêm os avisos brutos (INMET). Devolve o JSON sem tratar. */
export interface FonteDeAvisos {
  baixar(): Promise<unknown>;
}
