import { NaoEncontrado } from '../dominio/erros.js';
import type { RepositorioLeituras, RepositorioReguas } from '../dominio/portas.js';
import { estaAcimaDoLimite, type Leitura, type Regua } from '../dominio/regua.js';

export interface DepsRegua {
  reguas: RepositorioReguas;
  leituras: RepositorioLeituras;
}

export interface ReguaComUltimaLeitura {
  regua: Regua;
  ultimaLeitura: (Leitura & { acimaDoLimite: boolean }) | null;
}

/** Última leitura de uma régua. Sem `reguaId`, usa a primeira régua por id. */
export async function consultarRegua(
  deps: DepsRegua,
  reguaId?: string,
): Promise<{ regua: Regua; leitura: Leitura }> {
  const regua = reguaId === undefined ? ((await deps.reguas.listar())[0] ?? null) : await deps.reguas.buscarPorId(reguaId);
  if (!regua) throw new NaoEncontrado('Régua não encontrada.');

  const leitura = await deps.leituras.ultima(regua.id);
  if (!leitura) throw new NaoEncontrado('A régua ainda não tem leitura.');
  return { regua, leitura };
}

/** Todas as réguas com a última leitura. Com `codigoIbge`, só as do município. */
export async function listarReguas(deps: DepsRegua, filtro: { codigoIbge?: string } = {}): Promise<ReguaComUltimaLeitura[]> {
  const reguas = await deps.reguas.listar(filtro);
  return Promise.all(
    reguas.map(async (regua) => {
      const leitura = await deps.leituras.ultima(regua.id);
      return {
        regua,
        ultimaLeitura: leitura
          ? { ...leitura, acimaDoLimite: estaAcimaDoLimite(leitura.nivelMetros, regua.limiteMetros) }
          : null,
      };
    }),
  );
}
