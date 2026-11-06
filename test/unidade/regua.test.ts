import { describe, expect, it } from 'vitest';
import { DadoInvalido } from '../../src/dominio/erros.js';
import { chaveConfere, estaAcimaDoLimite, hashDaChave, validarLeitura } from '../../src/dominio/regua.js';

const agora = new Date('2026-11-06T12:00:00Z');
const base = { reguaId: 'regua-1', nivelMetros: 0.5 };

describe('estaAcimaDoLimite', () => {
  it('igual ao limite conta como acima', () => {
    expect(estaAcimaDoLimite(1.2, 1.2)).toBe(true);
  });
  it('abaixo do limite não conta', () => {
    expect(estaAcimaDoLimite(1.19, 1.2)).toBe(false);
  });
  it('acima do limite conta', () => {
    expect(estaAcimaDoLimite(2, 1.2)).toBe(true);
  });
});

describe('validarLeitura', () => {
  it('aceita 0 e 20 (limites do intervalo)', () => {
    expect(validarLeitura({ ...base, nivelMetros: 0 }, agora).nivelMetros).toBe(0);
    expect(validarLeitura({ ...base, nivelMetros: 20 }, agora).nivelMetros).toBe(20);
  });

  it('recusa nível negativo, acima de 20 e não numérico, com mensagem em português', () => {
    expect(() => validarLeitura({ ...base, nivelMetros: -0.01 }, agora)).toThrow(DadoInvalido);
    expect(() => validarLeitura({ ...base, nivelMetros: 20.01 }, agora)).toThrow(/entre 0 e 20/);
    expect(() => validarLeitura({ ...base, nivelMetros: Number.NaN }, agora)).toThrow(/deve ser um número/);
  });

  it('arredonda para 2 casas', () => {
    expect(validarLeitura({ ...base, nivelMetros: 1.2345 }, agora).nivelMetros).toBe(1.23);
    expect(validarLeitura({ ...base, nivelMetros: 1.005 }, agora).nivelMetros).toBe(1.01);
    expect(validarLeitura({ ...base, nivelMetros: 0.1 + 0.2 }, agora).nivelMetros).toBe(0.3);
  });

  it('bateria de 0 a 100; fora disso é recusada; ausente vira null', () => {
    expect(validarLeitura({ ...base, bateriaPercentual: 0 }, agora).bateriaPercentual).toBe(0);
    expect(validarLeitura({ ...base, bateriaPercentual: 100 }, agora).bateriaPercentual).toBe(100);
    expect(validarLeitura(base, agora).bateriaPercentual).toBeNull();
    expect(() => validarLeitura({ ...base, bateriaPercentual: 101 }, agora)).toThrow(/entre 0 e 100/);
    expect(() => validarLeitura({ ...base, bateriaPercentual: -1 }, agora)).toThrow(DadoInvalido);
  });

  it('sem medidaEm usa a hora do recebimento', () => {
    const l = validarLeitura(base, agora);
    expect(l.medidaEm).toEqual(agora);
    expect(l.recebidaEm).toEqual(agora);
  });

  it('aceita medidaEm até 5 minutos no futuro e recusa além disso', () => {
    const quase = new Date(agora.getTime() + 5 * 60_000);
    expect(validarLeitura({ ...base, medidaEm: quase }, agora).medidaEm).toEqual(quase);
    const alem = new Date(agora.getTime() + 5 * 60_000 + 1);
    expect(() => validarLeitura({ ...base, medidaEm: alem }, agora)).toThrow(/5 minutos no futuro/);
  });

  it('aceita medidaEm no passado', () => {
    const antes = new Date(agora.getTime() - 3_600_000);
    expect(validarLeitura({ ...base, medidaEm: antes }, agora).medidaEm).toEqual(antes);
  });

  it('recusa data inválida', () => {
    expect(() => validarLeitura({ ...base, medidaEm: new Date('x') }, agora)).toThrow(/data válida/);
  });
});

describe('chaveConfere', () => {
  const hash = hashDaChave('segredo');
  it('aceita a chave certa', () => expect(chaveConfere('segredo', hash)).toBe(true));
  it('recusa chave errada, vazia ou ausente', () => {
    expect(chaveConfere('outra', hash)).toBe(false);
    expect(chaveConfere('', hash)).toBe(false);
    expect(chaveConfere(undefined, hash)).toBe(false);
  });
  it('o hash é sha256 em hexadecimal (64 caracteres)', () => expect(hash).toMatch(/^[0-9a-f]{64}$/));
});
