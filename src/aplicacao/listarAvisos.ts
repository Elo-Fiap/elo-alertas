import { avisosDoMunicipio, codigoIbgeValido, type Aviso } from '../dominio/aviso.js';
import { DadoInvalido } from '../dominio/erros.js';
import type { RepositorioAvisos } from '../dominio/portas.js';

export const VALIDADE_PADRAO_MIN = 5;

export interface DepsListarAvisos {
  avisos: RepositorioAvisos;
  /** Sincroniza com a fonte (ver criarSincronizadorDeAvisos). */
  sincronizar: () => Promise<boolean>;
  agora: () => Date;
  validadeMin: number;
}

export interface ResultadoDeAvisos {
  avisos: Aviso[];
  /** Hora da última sincronização com sucesso, ou null se nunca houve. */
  atualizadoEm: Date | null;
}

/** Avisos de um município, lidos do banco. Se o cache venceu, sincroniza antes de responder. */
export async function listarAvisos(deps: DepsListarAvisos, codigoIbge: string): Promise<ResultadoDeAvisos> {
  if (!codigoIbgeValido(codigoIbge)) {
    throw new DadoInvalido('codigoIbge deve ter exatamente 7 dígitos.');
  }

  let atualizadoEm = await deps.avisos.ultimaSincronizacaoComSucesso();
  const vencido = atualizadoEm === null || deps.agora().getTime() - atualizadoEm.getTime() > deps.validadeMin * 60_000;
  if (vencido && (await deps.sincronizar())) {
    atualizadoEm = await deps.avisos.ultimaSincronizacaoComSucesso();
  }

  const doBanco = await deps.avisos.buscarPorMunicipio(codigoIbge);
  return { avisos: avisosDoMunicipio(doBanco, codigoIbge, deps.agora()), atualizadoEm };
}
