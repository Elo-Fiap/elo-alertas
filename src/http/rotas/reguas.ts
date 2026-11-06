import { Type } from '@fastify/type-provider-typebox';
import { consultarRegua, listarReguas } from '../../aplicacao/consultarRegua.js';
import { HORAS_MAXIMO, HORAS_PADRAO, LEITURAS_MAXIMO, listarHistorico } from '../../aplicacao/listarHistorico.js';
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

const SchemaUltimaLeitura = Type.Object(
  { reguaId, local, nivelMetros: nivel, limiteMetros: limite, medidaEm },
  { description: 'Última leitura de uma régua. É o formato que o app do Elo lê.' },
);

const SchemaReguaDaLista = Type.Object({
  reguaId,
  local,
  limiteMetros: limite,
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
      };
    },
  );

  app.get(
    '/reguas',
    {
      schema: {
        tags: ['sensor'],
        summary: 'Lista as réguas',
        description: 'Cada régua com a última leitura. A chave do dispositivo nunca é exposta.',
        response: { 200: Type.Array(SchemaReguaDaLista, { description: 'Réguas em ordem de id.' }) },
      },
    },
    async () => {
      const lista = await listarReguas(deps);
      return lista.map(({ regua, ultimaLeitura }) => ({
        reguaId: regua.id,
        local: regua.local,
        limiteMetros: regua.limiteMetros,
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
