import type { FonteDeAvisos } from '../dominio/portas.js';

export const URL_INMET_PADRAO = 'https://apiprevmet3.inmet.gov.br/avisos/ativos';

// A resposta real tem ~580 KB (polígonos e ícones). O app desiste em 10 s, então o serviço
// desiste antes (8 s) e responde com o que já tem no banco.
const TIMEOUT_INMET_MS = 8_000;

/** FonteDeAvisos real: baixa o JSON dos avisos ativos do INMET. */
export class FonteInmet implements FonteDeAvisos {
  constructor(
    private readonly url: string = URL_INMET_PADRAO,
    private readonly timeoutMs: number = TIMEOUT_INMET_MS,
  ) {}

  async baixar(): Promise<unknown> {
    const resposta = await fetch(this.url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!resposta.ok) throw new Error(`INMET respondeu HTTP ${resposta.status}.`);
    return resposta.json();
  }
}
