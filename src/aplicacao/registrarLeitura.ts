import { ChaveInvalida } from '../dominio/erros.js';
import type { RepositorioLeituras, RepositorioReguas } from '../dominio/portas.js';
import { chaveConfere, validarLeitura, type EntradaDeLeitura } from '../dominio/regua.js';

export interface DepsRegistrarLeitura {
  reguas: RepositorioReguas;
  leituras: RepositorioLeituras;
  agora: () => Date;
}

// Hash de uma chave que ninguém tem: faz a comparação rodar também quando a régua não existe.
const HASH_FALSO = '0'.repeat(64);

/**
 * Autentica o dispositivo e guarda a leitura. Régua inexistente e chave errada dão o mesmo erro,
 * para a API não revelar quais réguas existem.
 */
export async function registrarLeitura(
  deps: DepsRegistrarLeitura,
  chave: string | undefined,
  entrada: EntradaDeLeitura,
): Promise<void> {
  const regua = await deps.reguas.buscarPorId(entrada.reguaId);
  const confere = chaveConfere(chave, regua?.chaveHash ?? HASH_FALSO);
  if (!regua || !confere) throw new ChaveInvalida();

  const leitura = validarLeitura(entrada, deps.agora());
  await deps.leituras.registrar(leitura);
}
