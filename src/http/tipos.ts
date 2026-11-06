import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { Type } from '@fastify/type-provider-typebox';
import type {
  FastifyBaseLogger,
  FastifyInstance,
  RawReplyDefaultExpression,
  RawRequestDefaultExpression,
  RawServerDefault,
} from 'fastify';
import type { FonteDeAvisos, RepositorioAvisos, RepositorioLeituras, RepositorioReguas } from '../dominio/portas.js';

export type FastifyTypeBox = FastifyInstance<
  RawServerDefault,
  RawRequestDefaultExpression,
  RawReplyDefaultExpression,
  FastifyBaseLogger,
  TypeBoxTypeProvider
>;

/** Tudo que o app HTTP precisa de fora. Os testes injetam versões falsas. */
export interface DepsDoApp {
  reguas: RepositorioReguas;
  leituras: RepositorioLeituras;
  avisos: RepositorioAvisos;
  fonteDeAvisos: FonteDeAvisos;
  /** Lança se o banco não responde. */
  verificarBanco: () => Promise<void>;
  validadeAvisosMin: number;
  agora?: () => Date;
  logger?: boolean | { level: string };
}

export const SchemaErro = Type.Object(
  {
    erro: Type.String({ description: 'Código do erro, estável para o cliente tratar.', examples: ['nao_encontrado'] }),
    mensagem: Type.String({ description: 'Texto em português para mostrar ou registrar.' }),
  },
  { description: 'Formato único de erro de toda a API.' },
);
