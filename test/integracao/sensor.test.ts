import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CHAVE, criarAmbiente, type Ambiente } from './ajuda.js';

let amb: Ambiente;
beforeAll(async () => {
  amb = await criarAmbiente();
});
beforeEach(async () => {
  await amb.prisma.leitura.deleteMany();
});
afterAll(() => amb.fechar());

const postar = (body: unknown, chave: string | null = CHAVE) =>
  amb.app.inject({
    method: 'POST',
    url: '/leituras',
    headers: chave === null ? {} : { 'x-chave-dispositivo': chave },
    payload: body as object,
  });

describe('POST /leituras e GET /regua', () => {
  it('204 e depois GET /regua mostra a leitura, no formato que o app lê', async () => {
    const medidaEm = new Date(Date.now() - 60_000).toISOString();
    const r = await postar({ reguaId: 'regua-exemplo', nivelMetros: 0.87, medidaEm, bateriaPercentual: 91 });
    expect(r.statusCode).toBe(204);
    expect(r.body).toBe('');

    const g = await amb.app.inject({ url: '/regua?reguaId=regua-exemplo' });
    expect(g.statusCode).toBe(200);
    expect(g.json()).toEqual({
      reguaId: 'regua-exemplo',
      local: 'Córrego de teste',
      nivelMetros: 0.87,
      limiteMetros: 1.2,
      medidaEm,
      ruaId: '7',
      codigoIbge: '3550308',
      latitude: -23.476551,
      longitude: -46.41135,
      atencaoMetros: 1,
    });
  });

  it('sem reguaId usa a primeira régua por id (regua-b vem antes de regua-exemplo)', async () => {
    await postar({ reguaId: 'regua-b', nivelMetros: 0.3 }, 'outra-chave');
    const g = await amb.app.inject({ url: '/regua' });
    expect(g.statusCode).toBe(200);
    expect(g.json().reguaId).toBe('regua-b');
  });

  it('sem medidaEm usa a hora do recebimento e arredonda para 2 casas', async () => {
    const antes = Date.now();
    expect((await postar({ reguaId: 'regua-exemplo', nivelMetros: 1.2345 })).statusCode).toBe(204);
    const g = (await amb.app.inject({ url: '/regua?reguaId=regua-exemplo' })).json();
    expect(g.nivelMetros).toBe(1.23);
    expect(Date.parse(g.medidaEm)).toBeGreaterThanOrEqual(antes - 1000);
  });

  it('404 quando a régua não existe ou não tem leitura', async () => {
    const semLeitura = await amb.app.inject({ url: '/regua?reguaId=regua-exemplo' });
    expect(semLeitura.statusCode).toBe(404);
    expect(semLeitura.json()).toEqual({ erro: 'nao_encontrado', mensagem: 'A régua ainda não tem leitura.' });
    expect((await amb.app.inject({ url: '/regua?reguaId=nao-existe' })).statusCode).toBe(404);
  });
});

describe('autenticação do dispositivo', () => {
  it('chave errada ou ausente dá 401 chave_invalida', async () => {
    const errada = await postar({ reguaId: 'regua-exemplo', nivelMetros: 1 }, 'errada');
    expect(errada.statusCode).toBe(401);
    expect(errada.json().erro).toBe('chave_invalida');
    expect((await postar({ reguaId: 'regua-exemplo', nivelMetros: 1 }, null)).statusCode).toBe(401);
    expect(await amb.prisma.leitura.count()).toBe(0);
  });

  it('chave de outra régua não serve', async () => {
    expect((await postar({ reguaId: 'regua-exemplo', nivelMetros: 1 }, 'outra-chave')).statusCode).toBe(401);
  });

  it('régua inexistente também dá 401, com o mesmo corpo da chave errada', async () => {
    const inexistente = await postar({ reguaId: 'nao-existe', nivelMetros: 1 });
    const errada = await postar({ reguaId: 'regua-exemplo', nivelMetros: 1 }, 'errada');
    expect(inexistente.statusCode).toBe(401);
    expect(inexistente.json()).toEqual(errada.json());
  });
});

describe('corpo inválido', () => {
  const futuro = (min: number) => new Date(Date.now() + min * 60_000).toISOString();
  const casos: Array<[string, unknown]> = [
    ['nível acima de 20', { reguaId: 'regua-exemplo', nivelMetros: 20.5 }],
    ['nível negativo', { reguaId: 'regua-exemplo', nivelMetros: -1 }],
    ['nível em texto', { reguaId: 'regua-exemplo', nivelMetros: 'alto' }],
    ['sem nível', { reguaId: 'regua-exemplo' }],
    // Sem a checagem antes da validação, o Fastify converteria estes três para 0 ou 1.5 e gravaria.
    ['nível null (sensor com defeito)', { reguaId: 'regua-exemplo', nivelMetros: null }],
    ['nível booleano', { reguaId: 'regua-exemplo', nivelMetros: false }],
    ['nível número em texto', { reguaId: 'regua-exemplo', nivelMetros: '1.5' }],
    ['bateria null', { reguaId: 'regua-exemplo', nivelMetros: 1, bateriaPercentual: null }],
    ['sem reguaId', { nivelMetros: 1 }],
    ['bateria acima de 100', { reguaId: 'regua-exemplo', nivelMetros: 1, bateriaPercentual: 101 }],
    ['bateria negativa', { reguaId: 'regua-exemplo', nivelMetros: 1, bateriaPercentual: -5 }],
    ['medidaEm 10 min no futuro', { reguaId: 'regua-exemplo', nivelMetros: 1, medidaEm: futuro(10) }],
    ['medidaEm que não é data', { reguaId: 'regua-exemplo', nivelMetros: 1, medidaEm: 'ontem' }],
  ];
  it.each(casos)('400 para %s', async (_nome, corpo) => {
    const r = await postar(corpo);
    expect(r.statusCode).toBe(400);
    expect(r.json().erro).toBe('dado_invalido');
    expect(typeof r.json().mensagem).toBe('string');
    expect(await amb.prisma.leitura.count()).toBe(0);
  });

  it('a última leitura é a última que chegou, mesmo com o relógio do ESP32 adiantado', async () => {
    const adiantado = new Date(Date.now() + 4 * 60_000).toISOString();
    expect((await postar({ reguaId: 'regua-exemplo', nivelMetros: 0.5, medidaEm: adiantado })).statusCode).toBe(204);
    expect((await postar({ reguaId: 'regua-exemplo', nivelMetros: 1.7 })).statusCode).toBe(204);
    const r = await amb.app.inject({ url: '/regua?reguaId=regua-exemplo' });
    expect(r.json().nivelMetros).toBe(1.7);
  });

  it('medidaEm 4 min no futuro ainda passa', async () => {
    expect((await postar({ reguaId: 'regua-exemplo', nivelMetros: 1, medidaEm: futuro(4) })).statusCode).toBe(204);
  });
});

describe('localização e atenção da régua', () => {
  const semLocalizacao = {
    ruaId: null,
    codigoIbge: null,
    latitude: null,
    longitude: null,
    atencaoMetros: null,
  };

  it('GET /regua e GET /reguas devolvem os campos novos como número e texto, e null quando não há', async () => {
    await postar({ reguaId: 'regua-b', nivelMetros: 0.3 }, 'outra-chave');
    const b = (await amb.app.inject({ url: '/regua?reguaId=regua-b' })).json();
    expect(b).toMatchObject(semLocalizacao);

    const lista = (await amb.app.inject({ url: '/reguas' })).json();
    expect(lista[0]).toMatchObject({ reguaId: 'regua-b', ...semLocalizacao });
    expect(lista[1]).toMatchObject({
      reguaId: 'regua-exemplo',
      ruaId: '7',
      codigoIbge: '3550308',
      latitude: -23.476551,
      longitude: -46.41135,
      atencaoMetros: 1,
    });
    expect(typeof lista[1].latitude).toBe('number');
    expect(typeof lista[1].atencaoMetros).toBe('number');
  });

  it('GET /reguas?codigoIbge= filtra por município', async () => {
    const do_municipio = await amb.app.inject({ url: '/reguas?codigoIbge=3550308' });
    expect(do_municipio.statusCode).toBe(200);
    expect(do_municipio.json().map((x: { reguaId: string }) => x.reguaId)).toEqual(['regua-exemplo']);

    const outro = await amb.app.inject({ url: '/reguas?codigoIbge=3304557' });
    expect(outro.statusCode).toBe(200);
    expect(outro.json()).toEqual([]);
  });

  it.each(['123456', '12345678', 'abcdefg', '355030a', ''])('400 no formato do serviço para codigoIbge "%s"', async (codigo) => {
    const r = await amb.app.inject({ url: `/reguas?codigoIbge=${codigo}` });
    expect(r.statusCode).toBe(400);
    expect(r.json().erro).toBe('dado_invalido');
    expect(r.json().mensagem).toContain('codigoIbge');
  });

  it('o banco recusa coordenada sozinha, município torto e atenção acima do limite', async () => {
    const base = { local: 'x', limiteMetros: 1.2, chaveHash: 'h' };
    const recusa = (data: object) => amb.prisma.regua.create({ data: { id: 'ruim', ...base, ...data } });
    await expect(recusa({ latitude: -23.4 })).rejects.toThrow();
    await expect(recusa({ latitude: -123.4, longitude: -46.4 })).rejects.toThrow();
    await expect(recusa({ codigoIbge: '355' })).rejects.toThrow();
    await expect(recusa({ atencaoMetros: 1.2 })).rejects.toThrow();
    await expect(recusa({ atencaoMetros: 0 })).rejects.toThrow();
    expect(await amb.prisma.regua.count({ where: { id: 'ruim' } })).toBe(0);
  });
});

describe('GET /reguas e histórico', () => {
  it('lista as réguas com a última leitura e nunca expõe a chave', async () => {
    await postar({ reguaId: 'regua-exemplo', nivelMetros: 1.5 });
    const r = await amb.app.inject({ url: '/reguas' });
    expect(r.statusCode).toBe(200);
    expect(r.body).not.toMatch(/chave|hash/i);
    const lista = r.json();
    expect(lista.map((x: { reguaId: string }) => x.reguaId)).toEqual(['regua-b', 'regua-exemplo']);
    expect(lista[0].ultimaLeitura).toBeNull();
    expect(lista[1].ultimaLeitura).toMatchObject({ nivelMetros: 1.5, acimaDoLimite: true });
    expect(Object.keys(lista[1]).sort()).toEqual([
      'atencaoMetros',
      'codigoIbge',
      'latitude',
      'limiteMetros',
      'local',
      'longitude',
      'reguaId',
      'ruaId',
      'ultimaLeitura',
    ]);
  });

  it('histórico em ordem decrescente, respeita a janela de horas e valida o parâmetro', async () => {
    const agora = Date.now();
    for (const min of [5, 30, 120, 600]) {
      await amb.prisma.leitura.create({
        data: { reguaId: 'regua-exemplo', nivelMetros: min / 100, medidaEm: new Date(agora - min * 60_000) },
      });
    }
    const padrao = (await amb.app.inject({ url: '/reguas/regua-exemplo/leituras' })).json();
    expect(padrao.map((l: { nivelMetros: number }) => l.nivelMetros)).toEqual([0.05, 0.3, 1.2]);
    expect(padrao[2].acimaDoLimite).toBe(true);
    const uma = (await amb.app.inject({ url: '/reguas/regua-exemplo/leituras?horas=1' })).json();
    expect(uma).toHaveLength(2);
    const todas = (await amb.app.inject({ url: '/reguas/regua-exemplo/leituras?horas=72' })).json();
    expect(todas).toHaveLength(4);
    expect((await amb.app.inject({ url: '/reguas/regua-exemplo/leituras?horas=0' })).statusCode).toBe(400);
    expect((await amb.app.inject({ url: '/reguas/regua-exemplo/leituras?horas=73' })).statusCode).toBe(400);
    expect((await amb.app.inject({ url: '/reguas/nao-existe/leituras' })).statusCode).toBe(404);
  });

  it('limita o histórico a 500 itens', async () => {
    const agora = Date.now();
    await amb.prisma.leitura.createMany({
      data: Array.from({ length: 510 }, (_, i) => ({
        reguaId: 'regua-exemplo',
        nivelMetros: 0.5,
        medidaEm: new Date(agora - i * 1000),
      })),
    });
    const r = (await amb.app.inject({ url: '/reguas/regua-exemplo/leituras?horas=1' })).json();
    expect(r).toHaveLength(500);
  });
});
