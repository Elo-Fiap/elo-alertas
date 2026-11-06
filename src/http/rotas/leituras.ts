import { Type } from '@fastify/type-provider-typebox';
import { registrarLeitura } from '../../aplicacao/registrarLeitura.js';
import { NIVEL_MAXIMO_METROS } from '../../dominio/regua.js';
import { SchemaErro, type DepsDoApp, type FastifyTypeBox } from '../tipos.js';

export function rotasDeLeituras(app: FastifyTypeBox, deps: DepsDoApp, agora: () => Date): void {
  app.post(
    '/leituras',
    {
      // O ESP32 manda a cada 30 s (10 s acima do limite): rota leve, sem linha de log por requisição.
      logLevel: 'warn',
      schema: {
        tags: ['sensor'],
        summary: 'Registra uma leitura da régua',
        description:
          'Chamada pelo ESP32. Exige o header `X-Chave-Dispositivo`. Mais de 2 casas decimais em `nivelMetros` são arredondadas. Sem `medidaEm`, vale a hora do recebimento. Chave errada e régua inexistente dão o mesmo 401.',
        headers: Type.Object({
          'x-chave-dispositivo': Type.Optional(
            Type.String({ description: 'Chave do dispositivo da régua.', examples: ['troque-esta-chave-de-exemplo'] }),
          ),
        }),
        body: Type.Object({
          reguaId: Type.String({ minLength: 1, description: 'Identificador da régua.', examples: ['regua-exemplo'] }),
          nivelMetros: Type.Number({
            minimum: 0,
            maximum: NIVEL_MAXIMO_METROS,
            description: 'Nível da água em metros (0 a 20).',
            examples: [0.45],
          }),
          medidaEm: Type.Optional(
            Type.String({
              format: 'date-time',
              description: 'Quando o sensor mediu. Aceita até 5 minutos no futuro.',
              examples: ['2026-11-06T09:30:00-03:00'],
            }),
          ),
          bateriaPercentual: Type.Optional(
            Type.Number({ minimum: 0, maximum: 100, description: 'Carga da bateria (0 a 100).', examples: [87] }),
          ),
        }),
        response: {
          204: Type.Null({ description: 'Leitura guardada.' }),
          400: { ...SchemaErro, description: 'Corpo inválido (nível, bateria ou data fora das regras).' },
          401: { ...SchemaErro, description: 'Chave ausente ou inválida, ou régua inexistente.' },
        },
      },
    },
    async (req, reply) => {
      const { reguaId, nivelMetros, medidaEm, bateriaPercentual } = req.body;
      await registrarLeitura({ ...deps, agora }, req.headers['x-chave-dispositivo'], {
        reguaId,
        nivelMetros,
        ...(medidaEm !== undefined && { medidaEm: new Date(medidaEm) }),
        ...(bateriaPercentual !== undefined && { bateriaPercentual }),
      });
      return reply.code(204).send(null);
    },
  );
}
