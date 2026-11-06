import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { criarAmbiente, type Ambiente } from './ajuda.js';

// Relógio do teste: os avisos da fixture real valem em 05/11/2026. Cada teste anda 2 minutos,
// o que também passa a espera de 1 minuto depois de uma falha do INMET.
let t = Date.parse('2026-11-05T15:00:00Z');
const agora = () => new Date(t);

let amb: Ambiente;
beforeAll(async () => {
  amb = await criarAmbiente({ agora });
});
beforeEach(async () => {
  t += 2 * 60_000;
  await amb.prisma.aviso.deleteMany();
  await amb.prisma.sincronizacao.deleteMany();
  amb.fonte.chamadas = 0;
  amb.fonte.falhar = false;
});
afterAll(() => amb.fechar());

const avisos = (codigo: string) => amb.app.inject({ url: `/avisos?codigoIbge=${codigo}` });

describe('GET /avisos', () => {
  it('devolve só os avisos do município, na forma que o app lê, por gravidade', async () => {
    const r = await avisos('3550308');
    expect(r.statusCode).toBe(200);
    const lista = r.json();
    expect(lista.map((a: { id: string }) => a.id)).toEqual(['56273', '56272', '56278']);
    expect(Object.keys(lista[0]).sort()).toEqual([
      'fim', 'gravidade', 'id', 'inicio', 'instrucoes', 'quando', 'riscos', 'severidade', 'titulo',
    ]);
    // Mesmos campos do tipo Aviso do app: gravidade para ordenar, quando para separar hoje e futuro.
    expect(lista.map((a: { gravidade: number; quando: string }) => [a.gravidade, a.quando])).toEqual([
      [2, 'hoje'],
      [1, 'hoje'],
      [1, 'futuro'],
    ]);
    expect(lista[0]).toMatchObject({
      titulo: 'Tempestade',
      severidade: 'Perigo',
      inicio: '2026-11-05T03:01:00.000Z',
      fim: '2026-11-06T02:59:00.000Z',
    });
    expect(lista[0].riscos[0]).toMatch(/^Chuva entre/);
    expect(lista[0].instrucoes.length).toBeGreaterThan(1);
    expect(lista.map((a: { severidade: string }) => a.severidade)).toEqual(['Perigo', 'Perigo Potencial', 'Perigo Potencial']);
  });

  it('manda o header com a hora da última sincronização com sucesso', async () => {
    const r = await avisos('3550308');
    expect(Date.parse(String(r.headers['x-avisos-atualizados-em']))).toBe(t);
  });

  it('município sem aviso devolve lista vazia; código parecido não casa', async () => {
    expect((await avisos('1100015')).json()).toEqual([]);
    expect((await avisos('3550309')).json()).toEqual([]);
  });

  it('cache novo não chama o INMET de novo; o cache vence depois de AVISOS_VALIDADE_MIN', async () => {
    await avisos('3550308');
    await avisos('4100103');
    expect(amb.fonte.chamadas).toBe(1);
    await amb.prisma.sincronizacao.updateMany({ data: { feitaEm: new Date(t - 6 * 60_000) } });
    await avisos('3550308');
    expect(amb.fonte.chamadas).toBe(2);
    expect(await amb.prisma.aviso.count()).toBe(4);
  });

  it('INMET fora do ar: devolve o que está no banco e registra a falha', async () => {
    await avisos('3550308');
    await amb.prisma.sincronizacao.updateMany({ data: { feitaEm: new Date(t - 10 * 60_000) } });
    amb.fonte.falhar = true;
    const r = await avisos('3550308');
    expect(r.statusCode).toBe(200);
    expect(r.json()).toHaveLength(3);
    const falhas = await amb.prisma.sincronizacao.findMany({ where: { sucesso: false } });
    expect(falhas).toHaveLength(1);
    expect(falhas[0]?.erro).toMatch(/INMET fora do ar/);
    // O header continua apontando para a última sincronização com sucesso (10 min atrás).
    const hora = Date.parse(String(r.headers['x-avisos-atualizados-em']));
    expect(t - hora).toBeGreaterThan(9 * 60_000);
  });

  it('INMET fora do ar e banco vazio: lista vazia, sem header', async () => {
    amb.fonte.falhar = true;
    const r = await avisos('3550308');
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual([]);
    expect(r.headers['x-avisos-atualizados-em']).toBeUndefined();
  });

  it('requisições simultâneas fazem uma só sincronização', async () => {
    await Promise.all([avisos('3550308'), avisos('3550308'), avisos('4100103')]);
    expect(amb.fonte.chamadas).toBe(1);
    expect(await amb.prisma.sincronizacao.count({ where: { sucesso: true } })).toBe(1);
  });

  it('codigoIbge ausente ou fora do formato dá 400', async () => {
    for (const url of ['/avisos', '/avisos?codigoIbge=', '/avisos?codigoIbge=355030', '/avisos?codigoIbge=35503080', '/avisos?codigoIbge=abcdefg']) {
      const r = await amb.app.inject({ url });
      expect(r.statusCode, url).toBe(400);
      expect(r.json().erro).toBe('dado_invalido');
    }
    expect(amb.fonte.chamadas).toBe(0);
  });
});
