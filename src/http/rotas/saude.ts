import { Type } from '@fastify/type-provider-typebox';
import type { DepsDoApp, FastifyTypeBox } from '../tipos.js';

const SchemaSaude = Type.Object({
  status: Type.String({ examples: ['ok'] }),
  banco: Type.String({ examples: ['ok'] }),
});

export function rotasDeSaude(app: FastifyTypeBox, deps: DepsDoApp): void {
  app.get(
    '/saude',
    {
      schema: {
        tags: ['sistema'],
        summary: 'Saúde do serviço',
        description: 'Confere se o serviço está de pé e se o banco responde. Devolve 503 quando o banco não responde.',
        response: {
          200: { ...SchemaSaude, description: 'Serviço e banco de pé.' },
          503: { ...SchemaSaude, description: 'Banco não responde.' },
        },
      },
    },
    async (_req, reply) => {
      try {
        await deps.verificarBanco();
        return { status: 'ok', banco: 'ok' };
      } catch {
        return reply.code(503).send({ status: 'erro', banco: 'indisponivel' });
      }
    },
  );
}
