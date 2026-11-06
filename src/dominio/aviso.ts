import { DadoInvalido } from './erros.js';

export type Severidade = 'Perigo Potencial' | 'Perigo' | 'Grande Perigo';

export interface Aviso {
  id: string;
  titulo: string;
  severidade: Severidade;
  inicio: Date;
  fim: Date;
  riscos: string[];
  instrucoes: string[];
  /** Códigos IBGE de 7 dígitos cobertos pelo aviso. */
  municipios: string[];
  atualizadoEm: Date;
}

const GRAVIDADE: Record<Severidade, 1 | 2 | 3> = {
  'Perigo Potencial': 1,
  Perigo: 2,
  'Grande Perigo': 3,
};

const CODIGO_IBGE = /^\d{7}$/;

export function gravidade(severidade: Severidade): number {
  return GRAVIDADE[severidade];
}

/** Dia (AAAA-MM-DD) no horário de Brasília, que não tem horário de verão desde 2019. */
function diaEmBrasilia(data: Date): string {
  return new Date(data.getTime() - 3 * 60 * 60_000).toISOString().slice(0, 10);
}

/** "hoje" se o aviso começa hoje ou já começou (dia de Brasília); "futuro" se começa num dia seguinte. */
export function quandoDoAviso(inicio: Date, agora: Date): 'hoje' | 'futuro' {
  return diaEmBrasilia(inicio) <= diaEmBrasilia(agora) ? 'hoje' : 'futuro';
}

export function codigoIbgeValido(codigo: string): boolean {
  return CODIGO_IBGE.test(codigo);
}

function lerSeveridade(valor: unknown): Severidade {
  const texto = String(valor ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();
  if (texto === 'grande perigo') return 'Grande Perigo';
  if (texto === 'perigo') return 'Perigo';
  return 'Perigo Potencial';
}

/** "2026-11-05 00:01" (horário de Brasília, sem fuso) vira "2026-11-05T00:01:00-03:00". */
export function paraIsoDeBrasilia(valor: unknown): string {
  const texto = String(valor ?? '').trim();
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/.exec(texto);
  return m ? `${m[1]}T${m[2]}:00-03:00` : texto;
}

function lerData(valor: unknown): Date | null {
  const data = new Date(paraIsoDeBrasilia(valor));
  return Number.isNaN(data.getTime()) ? null : data;
}

function estaEncerrado(valor: unknown): boolean {
  return valor === true || String(valor ?? '').trim().toLowerCase() === 'true';
}

function lerMunicipios(geocodes: unknown): string[] {
  if (typeof geocodes !== 'string') return [];
  return geocodes
    .split(',')
    .map((c) => c.trim())
    .filter((c) => CODIGO_IBGE.test(c));
}

// Item entre aspas simples ou duplas, aceitando aspas escapadas dentro dele.
const ITEM_ENTRE_ASPAS = /'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"/g;

function limpar(itens: string[]): string[] {
  return itens.map((x) => x.replace(/\s+/g, ' ').trim()).filter((x) => x !== '');
}

/**
 * `riscos` e `instrucoes` do INMET. No JSON real são listas; a API não tem contrato publicado,
 * então também aceitamos a lista escrita como texto do Python ("['a', 'b']").
 * Formato inesperado vira 1 item, para o texto não se perder.
 */
export function converterListaPython(valor: unknown): string[] {
  if (Array.isArray(valor)) return limpar(valor.filter((x): x is string => typeof x === 'string'));
  if (typeof valor !== 'string') return [];

  const texto = valor.trim();
  if (texto === '' || texto === 'None' || texto === '[]') return [];
  if (!texto.startsWith('[') || !texto.endsWith(']')) return [texto];

  const itens = [...texto.matchAll(ITEM_ENTRE_ASPAS)].map((m) => (m[1] ?? m[2] ?? '').replace(/\\(.)/g, '$1'));
  return itens.length > 0 ? limpar(itens) : [texto];
}

function ehObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

function normalizarItem(item: unknown, agora: Date): Aviso | null {
  if (!ehObjeto(item)) return null;
  if (estaEncerrado(item.encerrado)) return null;

  const id = String(item.id ?? '').trim();
  const inicio = lerData(item.inicio);
  const fim = lerData(item.fim);
  if (id === '' || inicio === null || fim === null) return null;

  const municipios = lerMunicipios(item.geocodes);
  if (municipios.length === 0) return null;

  return {
    id,
    titulo: String(item.descricao ?? 'Aviso').trim(),
    severidade: lerSeveridade(item.severidade),
    inicio,
    fim,
    riscos: converterListaPython(item.riscos),
    instrucoes: converterListaPython(item.instrucoes),
    municipios,
    atualizadoEm: agora,
  };
}

/**
 * Transforma a resposta do INMET em avisos do domínio, para o país inteiro.
 * A resposta pode ser `{ hoje: [...], futuro: [...] }` ou uma lista. Descarta encerrados,
 * polígono e ícone. Se o formato for irreconhecível, lança erro (para não apagar o cache à toa).
 */
export function normalizarAvisosInmet(json: unknown, agora: Date): Aviso[] {
  let listas: unknown[];
  if (Array.isArray(json)) {
    listas = json;
  } else if (ehObjeto(json) && (Array.isArray(json.hoje) || Array.isArray(json.futuro))) {
    listas = [
      ...(Array.isArray(json.hoje) ? json.hoje : []),
      ...(Array.isArray(json.futuro) ? json.futuro : []),
    ];
  } else {
    throw new DadoInvalido('Resposta do INMET em formato inesperado.');
  }

  const vistos = new Set<string>();
  const avisos: Aviso[] = [];
  for (const item of listas) {
    const aviso = normalizarItem(item, agora);
    if (aviso === null || vistos.has(aviso.id)) continue;
    vistos.add(aviso.id);
    avisos.push(aviso);
  }
  return avisos;
}

/**
 * Avisos que cobrem o município (código IBGE inteiro, nunca prefixo),
 * do mais grave ao mais leve e, em empate, do que começa primeiro.
 */
export function avisosDoMunicipio(avisos: Aviso[], codigoIbge: string, agora?: Date): Aviso[] {
  // Com o INMET fora do ar, o cache pode guardar aviso que já terminou: esse não volta para o app.
  return avisos
    .filter((a) => a.municipios.includes(codigoIbge) && (agora === undefined || a.fim.getTime() >= agora.getTime()))
    .sort((a, b) => gravidade(b.severidade) - gravidade(a.severidade) || a.inicio.getTime() - b.inicio.getTime());
}
