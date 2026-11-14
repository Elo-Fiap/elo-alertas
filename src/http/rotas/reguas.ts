import { Type } from '@fastify/type-provider-typebox';
import type { TSchema } from 'typebox';
import { consultarRegua, listarReguas } from '../../aplicacao/consultarRegua.js';
import { HORAS_MAXIMO, HORAS_PADRAO, LEITURAS_MAXIMO, listarHistorico } from '../../aplicacao/listarHistorico.js';
import type { Regua } from '../../dominio/regua.js';
import { SchemaErro, type DepsDoApp, type FastifyTypeBox } from '../tipos.js';

const nivel = Type.Number({ description: 'Nível da água em metros.', examples: [0.45] });
const medidaEm = Type.String({
  format: 'date-time',
  description: 'Quando o sensor mediu (ISO 8601 com fuso).',
  examples: ['2026-11-06T09:30:00.000Z'],
});
const reguaId = Type.String({ description: 'Identificador da régua.', examples: ['regua-exemplo'] });
const local = Type.String({ description: 'Onde a régua está instalada.', examples: ['Córrego do bairro de exemplo'] });
const limite = Type.Number({ description: 'Nível em metros a partir do qual a rua é considerada em risco.', examples: [1.2] });

const Nulavel = <T extends TSchema>(tipo: T, description: string, examples: unknown[]) =>
  Type.Union([tipo, Type.Null()], { description, examples });

/** Onde a régua está e a que rua e município pertence. Cada campo é null quando não há. */
const camposDeLocalizacao = {
  ruaId: Nulavel(Type.String(), 'Id da rua na API do bairro, em texto.', ['7']),
  codigoIbge: Nulavel(Type.String(), 'Município da régua (código IBGE, 7 dígitos).', ['3550308']),
  latitude: Nulavel(Type.Number(), 'Latitude em graus decimais. Vem junto com a longitude, ou as duas são null.', [-23.476551]),
  longitude: Nulavel(Type.Number(), 'Longitude em graus decimais. Vem junto com a latitude, ou as duas são null.', [-46.41135]),
  atencaoMetros: Nulavel(Type.Number(), 'Nível em metros a partir do qual a régua pede atenção. Sempre menor que o limite.', [1]),
};

const SchemaUltimaLeitura = Type.Object(
  { reguaId, local, nivelMetros: nivel, limiteMetros: limite, medidaEm, ...camposDeLocalizacao },
  { description: 'Última leitura de uma régua. É o formato que o app do Elo lê; os campos de localização são aditivos.' },
);

const SchemaReguaDaLista = Type.Object({
  reguaId,
  local,
  limiteMetros: limite,
  ...camposDeLocalizacao,
  ultimaLeitura: Type.Union(
    [
      Type.Object({
        nivelMetros: nivel,
        medidaEm,
        acimaDoLimite: Type.Boolean({ description: 'true quando o nível é maior ou igual ao limite.' }),
      }),
      Type.Null(),
    ],
    { description: 'Última leitura, ou null se a régua ainda não mandou nenhuma.' },
  ),
});

const SchemaLeituraDoHistorico = Type.Object({
  nivelMetros: nivel,
  medidaEm,
  bateriaPercentual: Type.Union([Type.Integer(), Type.Null()], { description: 'Carga da bateria, se o dispositivo informou.' }),
  acimaDoLimite: Type.Boolean(),
});

function localizacaoDa(regua: Regua) {
  return {
    ruaId: regua.ruaId,
    codigoIbge: regua.codigoIbge,
    latitude: regua.latitude,
    longitude: regua.longitude,
    atencaoMetros: regua.atencaoMetros,
  };
}

export function rotasDeReguas(app: FastifyTypeBox, deps: DepsDoApp, agora: () => Date): void {
  app.get(
    '/regua',
    {
      schema: {
        tags: ['sensor'],
        summary: 'Última leitura da régua',
        description:
          'Devolve a última leitura da régua. Sem `reguaId`, usa a primeira régua por id. 404 se a régua não existe ou não tem leitura.',
        querystring: Type.Object({ reguaId: Type.Optional(reguaId) }),
        response: { 200: SchemaUltimaLeitura, 404: { ...SchemaErro, description: 'Régua inexistente ou sem leitura.' } },
      },
    },
    async (req) => {
      const { regua, leitura } = await consultarRegua(deps, req.query.reguaId);
      return {
        reguaId: regua.id,
        local: regua.local,
        nivelMetros: leitura.nivelMetros,
        limiteMetros: regua.limiteMetros,
        medidaEm: leitura.medidaEm.toISOString(),
        ...localizacaoDa(regua),
      };
    },
  );

  app.get(
    '/reguas',
    {
      schema: {
        tags: ['sensor'],
        summary: 'Lista as réguas',
        description:
          'Cada régua com a última leitura e a localização. Com `codigoIbge`, só as réguas do município. A chave do dispositivo nunca é exposta.',
        querystring: Type.Object({
          codigoIbge: Type.Optional(
            Type.String({
              pattern: '^[0-9]{7}$',
              description: 'Filtra pelo município (código IBGE, exatamente 7 dígitos).',
              examples: ['3550308'],
            }),
          ),
        }),
        response: {
          200: Type.Array(SchemaReguaDaLista, { description: 'Réguas em ordem de id; lista vazia se o município não tem nenhuma.' }),
          400: { ...SchemaErro, description: '`codigoIbge` fora do formato de 7 dígitos.' },
        },
      },
    },
    async (req) => {
      const lista = await listarReguas(deps, req.query.codigoIbge === undefined ? {} : { codigoIbge: req.query.codigoIbge });
      return lista.map(({ regua, ultimaLeitura }) => ({
        reguaId: regua.id,
        local: regua.local,
        limiteMetros: regua.limiteMetros,
        ...localizacaoDa(regua),
        ultimaLeitura: ultimaLeitura && {
          nivelMetros: ultimaLeitura.nivelMetros,
          medidaEm: ultimaLeitura.medidaEm.toISOString(),
          acimaDoLimite: ultimaLeitura.acimaDoLimite,
        },
      }));
    },
  );

  app.get(
    '/reguas/:id/leituras',
    {
      schema: {
        tags: ['sensor'],
        summary: 'Histórico de leituras',
        description: `Leituras das últimas \`horas\` (de 1 a ${HORAS_MAXIMO}, padrão ${HORAS_PADRAO}), da mais nova para a mais velha, no máximo ${LEITURAS_MAXIMO}.`,
        params: Type.Object({ id: reguaId }),
        querystring: Type.Object({
          horas: Type.Optional(
            Type.Integer({ minimum: 1, maximum: HORAS_MAXIMO, default: HORAS_PADRAO, description: 'Janela em horas.' }),
          ),
        }),
        response: {
          200: Type.Array(SchemaLeituraDoHistorico, { description: 'Leituras da mais nova para a mais velha.' }),
          400: { ...SchemaErro, description: '`horas` fora de 1 a 72.' },
          404: { ...SchemaErro, description: 'Régua inexistente.' },
        },
      },
    },
    async (req) => {
      const leituras = await listarHistorico({ ...deps, agora }, req.params.id, req.query.horas);
      return leituras.map((l) => ({
        nivelMetros: l.nivelMetros,
        medidaEm: l.medidaEm.toISOString(),
        bateriaPercentual: l.bateriaPercentual,
        acimaDoLimite: l.acimaDoLimite,
      }));
    },
  );
}
