import { DadoInvalido, NaoEncontrado } from '../dominio/erros.js';
import type { RepositorioLeituras, RepositorioReguas } from '../dominio/portas.js';
import { estaAcimaDoLimite, type Leitura } from '../dominio/regua.js';

export const HORAS_PADRAO = 6;
export const HORAS_MAXIMO = 72;
export const LEITURAS_MAXIMO = 500;

export interface DepsHistorico {
  reguas: RepositorioReguas;
  leituras: RepositorioLeituras;
  agora: () => Date;
}

export async function listarHistorico(
  deps: DepsHistorico,
  reguaId: string,
  horas: number = HORAS_PADRAO,
): Promise<Array<Leitura & { acimaDoLimite: boolean }>> {
  if (!Number.isInteger(horas) || horas < 1 || horas > HORAS_MAXIMO) {
    throw new DadoInvalido(`horas deve ser um inteiro de 1 a ${HORAS_MAXIMO}.`);
  }
  const regua = await deps.reguas.buscarPorId(reguaId);
  if (!regua) throw new NaoEncontrado('Régua não encontrada.');

  const desde = new Date(deps.agora().getTime() - horas * 3_600_000);
  const leituras = await deps.leituras.historico(regua.id, desde, LEITURAS_MAXIMO);
  return leituras.map((l) => ({ ...l, acimaDoLimite: estaAcimaDoLimite(l.nivelMetros, regua.limiteMetros) }));
}
