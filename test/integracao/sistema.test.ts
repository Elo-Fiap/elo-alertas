import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarAmbiente, type Ambiente } from './ajuda.js';

describe('GET /saude', () => {
  let amb: Ambiente;
  beforeAll(async () => {
    amb = await criarAmbiente();
  });
  afterAll(() => amb.fechar());

  it('200 com o banco no ar', async () => {
    const r = await amb.app.inject({ url: '/saude' });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ status: 'ok', banco: 'ok' });
  });

  it('rota inexistente devolve o formato de erro da API', async () => {
    const r = await amb.app.inject({ url: '/nada' });
    expect(r.statusCode).toBe(404);
    expect(r.json().erro).toBe('nao_encontrado');
  });
});

describe('GET /saude sem banco', () => {
  it('503 quando o banco não responde', async () => {
    const amb = await criarAmbiente({
      verificarBanco: async () => {
        throw new Error('sem conexão');
      },
    });
    const r = await amb.app.inject({ url: '/saude' });
    expect(r.statusCode).toBe(503);
    expect(r.json()).toEqual({ status: 'erro', banco: 'indisponivel' });
    await amb.fechar();
  });
});

describe('documentação automática', () => {
  let amb: Ambiente;
  beforeAll(async () => {
    amb = await criarAmbiente();
  });
  afterAll(() => amb.fechar());

  it('/docs/json é um OpenAPI com todas as rotas, descritas em português', async () => {
    const r = await amb.app.inject({ url: '/docs/json' });
    expect(r.statusCode).toBe(200);
    const doc = r.json();
    expect(doc.openapi).toMatch(/^3\.1/);
    expect(doc.info.title).toBe('Elo Alertas');
    const esperadas: Array<[string, string]> = [
      ['/saude', 'get'],
      ['/regua', 'get'],
      ['/reguas', 'get'],
      ['/reguas/{id}/leituras', 'get'],
      ['/leituras', 'post'],
      ['/avisos', 'get'],
    ];
    expect(Object.keys(doc.paths).sort()).toEqual(esperadas.map(([p]) => p).sort());
    for (const [caminho, metodo] of esperadas) {
      const op = doc.paths[caminho][metodo];
      expect(op.summary, caminho).toBeTruthy();
      expect(Object.keys(op.responses).length, caminho).toBeGreaterThan(0);
      expect(op.tags.length, caminho).toBeGreaterThan(0);
    }
    expect(doc.paths['/leituras'].post.requestBody).toBeDefined();
    expect(Object.keys(doc.paths['/leituras'].post.responses).sort()).toEqual(['204', '400', '401']);
  });

  it('a interface do Swagger responde em /docs', async () => {
    const r = await amb.app.inject({ url: '/docs/' });
    expect(r.statusCode).toBe(200);
    expect(r.headers['content-type']).toMatch(/text\/html/);
  });
});
