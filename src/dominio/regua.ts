import { createHash, timingSafeEqual } from 'node:crypto';
import { DadoInvalido } from './erros.js';

export interface Regua {
  id: string;
  local: string;
  limiteMetros: number;
  alturaSensorMetros: number | null;
  /** sha256 em hexadecimal da chave do dispositivo. Nunca sai pela API. */
  chaveHash: string;
}

export interface Leitura {
  reguaId: string;
  nivelMetros: number;
  medidaEm: Date;
  recebidaEm: Date;
  bateriaPercentual: number | null;
}

/** O que o dispositivo manda. A data chega opcional: sem ela vale a hora do recebimento. */
export interface EntradaDeLeitura {
  reguaId: string;
  nivelMetros: number;
  medidaEm?: Date;
  bateriaPercentual?: number;
}

export const NIVEL_MAXIMO_METROS = 20;
export const TOLERANCIA_FUTURO_MS = 5 * 60 * 1000;

/** Nível igual ao limite já conta como acima: é a hora de agir, não de esperar passar. */
export function estaAcimaDoLimite(nivelMetros: number, limiteMetros: number): boolean {
  return nivelMetros >= limiteMetros;
}

function arredondar2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Confere a leitura contra as regras do domínio e devolve a leitura pronta para guardar. */
export function validarLeitura(entrada: EntradaDeLeitura, agora: Date): Leitura {
  const { nivelMetros, bateriaPercentual } = entrada;

  if (typeof nivelMetros !== 'number' || !Number.isFinite(nivelMetros)) {
    throw new DadoInvalido('nivelMetros deve ser um número.');
  }
  if (nivelMetros < 0 || nivelMetros > NIVEL_MAXIMO_METROS) {
    throw new DadoInvalido(`nivelMetros deve ficar entre 0 e ${NIVEL_MAXIMO_METROS} metros.`);
  }

  if (bateriaPercentual !== undefined) {
    if (typeof bateriaPercentual !== 'number' || !Number.isFinite(bateriaPercentual)) {
      throw new DadoInvalido('bateriaPercentual deve ser um número.');
    }
    if (bateriaPercentual < 0 || bateriaPercentual > 100) {
      throw new DadoInvalido('bateriaPercentual deve ficar entre 0 e 100.');
    }
  }

  const medidaEm = entrada.medidaEm ?? agora;
  if (Number.isNaN(medidaEm.getTime())) {
    throw new DadoInvalido('medidaEm não é uma data válida.');
  }
  if (medidaEm.getTime() > agora.getTime() + TOLERANCIA_FUTURO_MS) {
    throw new DadoInvalido('medidaEm está mais de 5 minutos no futuro.');
  }

  return {
    reguaId: entrada.reguaId,
    nivelMetros: arredondar2(nivelMetros),
    medidaEm,
    recebidaEm: agora,
    bateriaPercentual: bateriaPercentual === undefined ? null : Math.round(bateriaPercentual),
  };
}

export function hashDaChave(chave: string): string {
  return createHash('sha256').update(chave, 'utf8').digest('hex');
}

/** Compara a chave recebida com o hash guardado em tempo constante. */
export function chaveConfere(chave: string | undefined, chaveHash: string): boolean {
  const calculado = Buffer.from(hashDaChave(chave ?? ''), 'hex');
  const esperado = Buffer.from(chaveHash, 'hex');
  if (chave === undefined || chave === '') return false;
  return calculado.length === esperado.length && timingSafeEqual(calculado, esperado);
}
