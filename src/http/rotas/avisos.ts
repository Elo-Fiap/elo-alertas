import { Type } from '@fastify/type-provider-typebox';
import { listarAvisos } from '../../aplicacao/listarAvisos.js';
import { gravidade, quandoDoAviso } from '../../dominio/aviso.js';
import { SchemaErro, type DepsDoApp, type FastifyTypeBox } from '../tipos.js';

const SchemaAviso = Type.Object({
  id: Type.String({ description: 'Identificador do aviso no INMET.', examples: ['56273'] }),
  titulo: Type.String({ examples: ['Tempestade'] }),
  severidade: Type.Union([Type.Literal('Perigo Potencial'), Type.Literal('Perigo'), Type.Literal('Grande Perigo')], {
    description: 'Gravidade do aviso, da mais leve para a mais grave.',
  }),
  gravidade: Type.Union([Type.Literal(1), Type.Literal(2), Type.Literal(3)], {
    description: '1 = Perigo Potencial, 2 = Perigo, 3 = Grande Perigo. O app ordena por este número.',
  }),
  quando: Type.Union([Type.Literal('hoje'), Type.Literal('futuro')], {
    description: '"hoje" se o aviso já vale hoje (horário de Brasília); "futuro" se começa num dia seguinte.',
  }),
  inicio: Type.String({ format: 'date-time', examples: ['2026-11-05T03:01:00.000Z'] }),
  fim: Type.String({ format: 'date-time', examples: ['2026-11-06T02:59:00.000Z'] }),
  riscos: Type.Array(Type.String(), { description: 'Riscos descritos pelo INMET.' }),
  instrucoes: Type.Array(Type.String(), { description: 'O que fazer, segundo o INMET.' }),
});

export function rotasDeAvisos(
  app: FastifyTypeBox,
  deps: DepsDoApp,
  extra: { sincronizar: () => Promise<boolean>; agora: () => Date },
): void {
  app.get(
    '/avisos',
    {
      schema: {
        tags: ['avisos'],
        summary: 'Avisos do INMET para um município',
        description:
          'Devolve só os avisos que cobrem o município, do mais grave ao mais leve. Lê do banco; se a última sincronização com o INMET passou de `AVISOS_VALIDADE_MIN` minutos, sincroniza antes de responder. Se o INMET falhar, devolve o que está guardado. O header `X-Avisos-Atualizados-Em` traz a hora da última sincronização com sucesso.',
        querystring: Type.Object({
          codigoIbge: Type.String({
            pattern: '^[0-9]{7}$',
            description: 'Código IBGE do município, exatamente 7 dígitos.',
            examples: ['3550308'],
          }),
        }),
        response: {
          200: Type.Array(SchemaAviso, { description: 'Avisos do município; lista vazia se não há nenhum.' }),
          400: { ...SchemaErro, description: '`codigoIbge` ausente ou fora do formato de 7 dígitos.' },
        },
      },
    },
    async (req, reply) => {
      const { avisos, atualizadoEm } = await listarAvisos(
        {
          avisos: deps.avisos,
          sincronizar: extra.sincronizar,
          agora: extra.agora,
          validadeMin: deps.validadeAvisosMin,
        },
        req.query.codigoIbge,
      );
      if (atualizadoEm) reply.header('X-Avisos-Atualizados-Em', atualizadoEm.toISOString());
      return avisos.map((a) => ({
        id: a.id,
        titulo: a.titulo,
        severidade: a.severidade,
        gravidade: gravidade(a.severidade) as 1 | 2 | 3,
        quando: quandoDoAviso(a.inicio, extra.agora()),
        inicio: a.inicio.toISOString(),
        fim: a.fim.toISOString(),
        riscos: a.riscos,
        instrucoes: a.instrucoes,
      }));
    },
  );
}
