import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { avisosDoMunicipio, converterListaPython, normalizarAvisosInmet, quandoDoAviso } from '../../src/dominio/aviso.js';

const fixture: unknown = JSON.parse(readFileSync(new URL('../fixtures/inmet-ativos.json', import.meta.url), 'utf8'));
const agora = new Date('2026-11-05T12:00:00Z');
const SAO_PAULO = '3550308';

const base = {
  id: '1',
  descricao: 'Chuvas',
  severidade: 'Perigo',
  inicio: '2026-11-05 10:00',
  fim: '2026-11-05 23:59',
  geocodes: '3550308',
  riscos: '[]',
  instrucoes: '[]',
};
const lista = (...itens: object[]) => ({ hoje: itens, futuro: [] });

describe('normalizarAvisosInmet (fixture real)', () => {
  const todos = normalizarAvisosInmet(fixture, agora);
  const sp = avisosDoMunicipio(todos, SAO_PAULO);

  it('guarda os 4 avisos do país e filtra por código exato', () => {
    expect(todos.map((a) => a.id).sort()).toEqual(['56272', '56273', '56278', '56283']);
    expect(sp.map((a) => a.id).sort()).toEqual(['56272', '56273', '56278']);
  });

  it('ordena por gravidade e depois por início', () => {
    expect(sp.map((a) => a.id)).toEqual(['56273', '56272', '56278']);
    expect(sp[0]?.severidade).toBe('Perigo');
  });

  it('converte as datas de Brasília (sem fuso) para instantes certos', () => {
    expect(sp[0]?.inicio.toISOString()).toBe('2026-11-05T03:01:00.000Z');
    expect(sp[0]?.fim.toISOString()).toBe('2026-11-06T02:59:00.000Z');
  });

  it('riscos e instruções viram listas e o polígono não vem junto', () => {
    expect(sp[0]?.riscos[0]).toMatch(/^Chuva entre/);
    expect(sp[0]?.instrucoes.length).toBeGreaterThan(1);
    expect(Object.keys(sp[0] ?? {}).sort()).toEqual(
      ['atualizadoEm', 'fim', 'id', 'inicio', 'instrucoes', 'municipios', 'riscos', 'severidade', 'titulo'].sort(),
    );
    expect(sp[0]?.municipios).toContain(SAO_PAULO);
    expect(sp[0]?.atualizadoEm).toEqual(agora);
  });
});

describe('normalizarAvisosInmet (casos de borda)', () => {
  it('prefixo e código maior não casam, só o código inteiro', () => {
    const avisos = normalizarAvisosInmet(lista({ ...base, geocodes: '355030,35503089,13550308' }), agora);
    expect(avisosDoMunicipio(avisos, SAO_PAULO)).toEqual([]);
    const exato = normalizarAvisosInmet(lista({ ...base, geocodes: ' 355030 , 3550308 ' }), agora);
    expect(avisosDoMunicipio(exato, SAO_PAULO)).toHaveLength(1);
  });

  it('descarta encerrados (texto ou booleano)', () => {
    const json = lista(
      { ...base, id: 'a', encerrado: 'True' },
      { ...base, id: 'b', encerrado: true },
      { ...base, id: 'c', encerrado: 'False' },
      { ...base, id: 'd', encerrado: false },
    );
    expect(normalizarAvisosInmet(json, agora).map((a) => a.id)).toEqual(['c', 'd']);
  });

  it('severidade sem acento e maiúsculas; desconhecida vira Perigo Potencial', () => {
    const json = lista(
      { ...base, id: 'p', severidade: 'PERIGO' },
      { ...base, id: 'g', severidade: ' grande perigo ' },
      { ...base, id: 'x', severidade: '???' },
    );
    const r = avisosDoMunicipio(normalizarAvisosInmet(json, agora), SAO_PAULO);
    expect(r.map((a) => a.id)).toEqual(['g', 'p', 'x']);
    expect(r.map((a) => a.severidade)).toEqual(['Grande Perigo', 'Perigo', 'Perigo Potencial']);
  });

  it('data de Brasília: 00:01 local é 03:01 em UTC', () => {
    const [a] = normalizarAvisosInmet(lista({ ...base, inicio: '2026-11-05 00:01', fim: '2026-11-05 23:59' }), agora);
    expect(a?.inicio.toISOString()).toBe('2026-11-05T03:01:00.000Z');
    expect(a?.fim.toISOString()).toBe('2026-11-06T02:59:00.000Z');
  });

  it('aceita riscos e instruções como texto de lista do Python, com apóstrofo', () => {
    const [a] = normalizarAvisosInmet(
      lista({ ...base, riscos: "['Alagamento', 'Queda de árvores']", instrucoes: `["Água d'alto nível", 'B']` }),
      agora,
    );
    expect(a?.riscos).toEqual(['Alagamento', 'Queda de árvores']);
    expect(a?.instrucoes).toEqual(["Água d'alto nível", 'B']);
  });

  it('texto sem lista vira 1 item', () => {
    expect(converterListaPython('Texto solto')).toEqual(['Texto solto']);
    expect(converterListaPython('None')).toEqual([]);
    expect(converterListaPython(undefined)).toEqual([]);
  });

  it('aceita a resposta como lista e remove repetidos entre hoje e futuro', () => {
    expect(normalizarAvisosInmet([base], agora)).toHaveLength(1);
    expect(normalizarAvisosInmet({ hoje: [base], futuro: [base] }, agora)).toHaveLength(1);
  });

  it('pula itens sem id ou com data inválida, sem quebrar com lixo', () => {
    const json = { hoje: [null, 3, { ...base, id: '' }, { ...base, id: 'z', inicio: 'ontem' }, base], futuro: 'x' };
    expect(normalizarAvisosInmet(json, agora).map((a) => a.id)).toEqual(['1']);
  });

  it('formato irreconhecível lança erro (para não apagar o cache)', () => {
    expect(() => normalizarAvisosInmet(null, agora)).toThrow(/formato inesperado/);
    expect(() => normalizarAvisosInmet({ erro: 'x' }, agora)).toThrow(/formato inesperado/);
    expect(normalizarAvisosInmet({ hoje: [], futuro: [] }, agora)).toEqual([]);
  });
});

describe('quandoDoAviso (dia de Brasília)', () => {
  const agora = new Date('2026-11-05T15:00:00Z'); // 12h de 05/11 em Brasília
  it('começou ontem ou hoje é "hoje"', () => {
    expect(quandoDoAviso(new Date('2026-11-04T10:00:00Z'), agora)).toBe('hoje');
    expect(quandoDoAviso(new Date('2026-11-05T03:01:00Z'), agora)).toBe('hoje');
  });
  it('23h50 de hoje em Brasília ainda é "hoje", mesmo já sendo amanhã em UTC', () => {
    expect(quandoDoAviso(new Date('2026-11-06T02:50:00Z'), agora)).toBe('hoje');
  });
  it('a partir da meia-noite de amanhã em Brasília é "futuro"', () => {
    expect(quandoDoAviso(new Date('2026-11-06T03:00:00Z'), agora)).toBe('futuro');
  });
});
