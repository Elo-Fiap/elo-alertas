import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { listarAvisos } from '../../src/aplicacao/listarAvisos.js';
import { listarHistorico } from '../../src/aplicacao/listarHistorico.js';
import { consultarRegua, listarReguas } from '../../src/aplicacao/consultarRegua.js';
import { registrarLeitura } from '../../src/aplicacao/registrarLeitura.js';
import { criarSincronizadorDeAvisos } from '../../src/aplicacao/sincronizarAvisos.js';
import { ChaveInvalida, DadoInvalido, NaoEncontrado } from '../../src/dominio/erros.js';
import { AvisosEmMemoria, FonteFalsa, LeiturasEmMemoria, ReguasEmMemoria, reguaDeTeste } from './memoria.js';

const fixture: unknown = JSON.parse(readFileSync(new URL('../fixtures/inmet-ativos.json', import.meta.url), 'utf8'));

function relogio(inicio = '2026-11-05T15:00:00Z') {
  let t = new Date(inicio).getTime();
  return { agora: () => new Date(t), avancarMin: (m: number) => void (t += m * 60_000) };
}

describe('registrarLeitura', () => {
  const cenario = () => {
    const leituras = new LeiturasEmMemoria();
    const r = relogio();
    return { leituras, deps: { reguas: new ReguasEmMemoria([reguaDeTeste()]), leituras, agora: r.agora } };
  };

  it('guarda a leitura com a chave certa', async () => {
    const { leituras, deps } = cenario();
    await registrarLeitura(deps, 'chave-secreta', { reguaId: 'regua-1', nivelMetros: 0.8 });
    expect(leituras.itens).toHaveLength(1);
    expect(leituras.itens[0]?.nivelMetros).toBe(0.8);
  });

  it('chave errada, ausente ou régua inexistente dão o mesmo erro e nada é guardado', async () => {
    const { leituras, deps } = cenario();
    await expect(registrarLeitura(deps, 'errada', { reguaId: 'regua-1', nivelMetros: 1 })).rejects.toThrow(ChaveInvalida);
    await expect(registrarLeitura(deps, undefined, { reguaId: 'regua-1', nivelMetros: 1 })).rejects.toThrow(ChaveInvalida);
    await expect(registrarLeitura(deps, 'chave-secreta', { reguaId: 'nao-existe', nivelMetros: 1 })).rejects.toThrow(ChaveInvalida);
    expect(leituras.itens).toHaveLength(0);
  });

  it('com chave certa, dado inválido é recusado', async () => {
    const { deps } = cenario();
    await expect(registrarLeitura(deps, 'chave-secreta', { reguaId: 'regua-1', nivelMetros: 99 })).rejects.toThrow(DadoInvalido);
  });
});

describe('consultar régua e histórico', () => {
  it('última leitura, 404 sem régua ou sem leitura, e primeira régua por id quando não se informa', async () => {
    const leituras = new LeiturasEmMemoria();
    const outra = { ...reguaDeTeste(), id: 'a-regua', local: 'Outra' };
    const deps = { reguas: new ReguasEmMemoria([reguaDeTeste(), outra]), leituras };
    await expect(consultarRegua(deps, 'regua-1')).rejects.toThrow(NaoEncontrado);
    await expect(consultarRegua(deps, 'x')).rejects.toThrow(NaoEncontrado);

    const t = new Date('2026-11-06T10:00:00Z');
    leituras.itens.push({ reguaId: 'regua-1', nivelMetros: 0.5, medidaEm: t, recebidaEm: t, bateriaPercentual: null });
    leituras.itens.push({ reguaId: 'a-regua', nivelMetros: 1.5, medidaEm: t, recebidaEm: t, bateriaPercentual: null });
    expect((await consultarRegua(deps, 'regua-1')).leitura.nivelMetros).toBe(0.5);
    expect((await consultarRegua(deps)).regua.id).toBe('a-regua');

    const lista = await listarReguas(deps);
    expect(lista.map((x) => [x.regua.id, x.ultimaLeitura?.acimaDoLimite])).toEqual([['a-regua', true], ['regua-1', false]]);
  });

  it('histórico respeita a janela, a ordem e valida horas', async () => {
    const leituras = new LeiturasEmMemoria();
    const r = relogio();
    const deps = { reguas: new ReguasEmMemoria([reguaDeTeste()]), leituras, agora: r.agora };
    for (const min of [10, 90, 400]) {
      const t = new Date(r.agora().getTime() - min * 60_000);
      leituras.itens.push({ reguaId: 'regua-1', nivelMetros: min / 100, medidaEm: t, recebidaEm: t, bateriaPercentual: null });
    }
    expect((await listarHistorico(deps, 'regua-1')).map((l) => l.nivelMetros)).toEqual([0.1, 0.9]);
    expect(await listarHistorico(deps, 'regua-1', 72)).toHaveLength(3);
    await expect(listarHistorico(deps, 'regua-1', 0)).rejects.toThrow(DadoInvalido);
    await expect(listarHistorico(deps, 'regua-1', 73)).rejects.toThrow(DadoInvalido);
    await expect(listarHistorico(deps, 'x')).rejects.toThrow(NaoEncontrado);
  });
});

describe('listarAvisos (cache do banco)', () => {
  function cenario(resposta: unknown | Error = fixture) {
    const avisos = new AvisosEmMemoria();
    const fonte = new FonteFalsa(resposta);
    const r = relogio();
    const sincronizar = criarSincronizadorDeAvisos({ fonte, avisos, agora: r.agora });
    const deps = { avisos, sincronizar, agora: r.agora, validadeMin: 5 };
    return { avisos, fonte, r, deps };
  }

  it('sincroniza quando nunca sincronizou e devolve só o município, por gravidade', async () => {
    const { deps, fonte, avisos } = cenario();
    const res = await listarAvisos(deps, '3550308');
    expect(fonte.chamadas).toBe(1);
    expect(res.avisos.map((a) => a.id)).toEqual(['56273', '56272', '56278']);
    expect(res.atualizadoEm).toEqual(new Date('2026-11-05T15:00:00Z'));
    expect(avisos.avisos).toHaveLength(4);
  });

  it('não sincroniza enquanto o cache é novo, e sincroniza de novo quando vence', async () => {
    const { deps, fonte, r } = cenario();
    await listarAvisos(deps, '3550308');
    r.avancarMin(5);
    await listarAvisos(deps, '3550308');
    expect(fonte.chamadas).toBe(1);
    r.avancarMin(1);
    await listarAvisos(deps, '3550308');
    expect(fonte.chamadas).toBe(2);
  });

  it('INMET falhando devolve o cache e registra a falha', async () => {
    const { deps, fonte, avisos, r } = cenario();
    await listarAvisos(deps, '3550308');
    const primeira = r.agora();
    fonte.resposta = new Error('tempo esgotado');
    r.avancarMin(10);
    const res = await listarAvisos(deps, '3550308');
    expect(res.avisos).toHaveLength(3);
    expect(res.atualizadoEm).toEqual(primeira);
    expect(avisos.sincronizacoes.at(-1)).toMatchObject({ sucesso: false, erro: 'tempo esgotado' });
    expect(avisos.avisos).toHaveLength(4);
  });

  it('INMET falhando sem cache devolve lista vazia e sem data', async () => {
    const { deps } = cenario(new Error('fora do ar'));
    const res = await listarAvisos(deps, '3550308');
    expect(res.avisos).toEqual([]);
    expect(res.atualizadoEm).toBeNull();
  });

  it('resposta em formato inesperado conta como falha e não apaga o cache', async () => {
    const { deps, fonte, avisos, r } = cenario();
    await listarAvisos(deps, '3550308');
    fonte.resposta = { erro: 'manutencao' };
    r.avancarMin(10);
    await listarAvisos(deps, '3550308');
    expect(avisos.avisos).toHaveLength(4);
    expect(avisos.sincronizacoes.at(-1)?.sucesso).toBe(false);
  });

  it('depois de uma falha, espera 1 minuto antes de tentar o INMET de novo', async () => {
    const { deps, fonte, r } = cenario(new Error('fora do ar'));
    await listarAvisos(deps, '3550308');
    r.avancarMin(0.5);
    await listarAvisos(deps, '3550308');
    expect(fonte.chamadas).toBe(1);
    r.avancarMin(1);
    fonte.resposta = fixture;
    const res = await listarAvisos(deps, '3550308');
    expect(fonte.chamadas).toBe(2);
    expect(res.avisos).toHaveLength(3);
  });

  it('aviso que já terminou não volta, mesmo com o cache antigo', async () => {
    const { deps, fonte, r } = cenario();
    await listarAvisos(deps, '3550308');
    fonte.resposta = new Error('fora do ar');
    r.avancarMin(12 * 60); // 05/11 às 24h em Brasília: os avisos de hoje acabaram às 23h59
    const res = await listarAvisos(deps, '3550308');
    expect(res.avisos.map((a) => a.id)).toEqual(['56278']);
  });

  it('chamadas simultâneas compartilham uma só sincronização', async () => {
    const { deps, fonte } = cenario();
    await Promise.all([listarAvisos(deps, '3550308'), listarAvisos(deps, '3550308'), listarAvisos(deps, '4100103')]);
    expect(fonte.chamadas).toBe(1);
  });

  it('código IBGE inválido é recusado antes de qualquer sincronização', async () => {
    const { deps, fonte } = cenario();
    for (const ruim of ['', '355030', '35503080', 'abcdefg', '355030a']) {
      await expect(listarAvisos(deps, ruim)).rejects.toThrow(DadoInvalido);
    }
    expect(fonte.chamadas).toBe(0);
  });
});
