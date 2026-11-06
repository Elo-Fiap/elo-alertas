import { normalizarAvisosInmet } from '../dominio/aviso.js';
import type { FonteDeAvisos, RepositorioAvisos } from '../dominio/portas.js';

export interface DepsSincronizacao {
  fonte: FonteDeAvisos;
  avisos: RepositorioAvisos;
  agora: () => Date;
}

/**
 * Cria a função que baixa os avisos do INMET e troca o cache do banco.
 * Chamadas simultâneas no mesmo processo compartilham a mesma promessa em andamento.
 * Nunca lança: se a fonte falha ou estoura o tempo, registra a falha e devolve false.
 */
export const ESPERA_APOS_FALHA_MS = 60_000;

export function criarSincronizadorDeAvisos(deps: DepsSincronizacao): () => Promise<boolean> {
  let emAndamento: Promise<boolean> | null = null;
  let ultimaFalhaEm: number | null = null;

  async function sincronizar(): Promise<boolean> {
    const feitaEm = deps.agora();
    // Com o INMET fora do ar, não tenta de novo a cada pedido: espera 1 minuto e responde com o cache.
    if (ultimaFalhaEm !== null && feitaEm.getTime() - ultimaFalhaEm < ESPERA_APOS_FALHA_MS) return false;
    try {
      const bruto = await deps.fonte.baixar();
      const avisos = normalizarAvisosInmet(bruto, feitaEm);
      await deps.avisos.substituirTodos(avisos, feitaEm);
      ultimaFalhaEm = null;
      return true;
    } catch (erro) {
      ultimaFalhaEm = feitaEm.getTime();
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      try {
        await deps.avisos.registrarFalha(mensagem, feitaEm);
      } catch {
        // Sem banco para registrar a falha: nada mais a fazer aqui.
      }
      return false;
    }
  }

  return () => {
    emAndamento ??= sincronizar().finally(() => {
      emAndamento = null;
    });
    return emAndamento;
  };
}
