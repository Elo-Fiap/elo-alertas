import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import Fastify, { type FastifyInstance } from 'fastify';
import { criarSincronizadorDeAvisos } from '../aplicacao/sincronizarAvisos.js';
import { ErroDeDominio } from '../dominio/erros.js';
import { rotasDeAvisos } from './rotas/avisos.js';
import { rotasDeLeituras } from './rotas/leituras.js';
import { rotasDeReguas } from './rotas/reguas.js';
import { rotasDeSaude } from './rotas/saude.js';
import type { DepsDoApp, FastifyTypeBox } from './tipos.js';

const STATUS_POR_CODIGO: Record<string, number> = {
  nao_encontrado: 404,
  chave_invalida: 401,
  dado_invalido: 400,
};

const TIPOS: Record<string, string> = { string: 'texto', number: 'número', integer: 'número inteiro', boolean: 'verdadeiro ou falso' };

/** Mensagens de validação do schema em português, no formato que a API usa. */
function formatarErroDeSchema(
  erros: Array<{ keyword: string; instancePath: string; message?: string; params: Record<string, unknown> }>,
): Error {
  const e = erros[0];
  if (!e) return new Error('Requisição inválida.');
  const campo = String(e.params.missingProperty ?? e.instancePath.replace(/^\//, '').replaceAll('/', '.'));
  switch (e.keyword) {
    case 'required':
      return new Error(`O campo "${campo}" é obrigatório.`);
    case 'type':
      return new Error(`O campo "${campo}" deve ser ${TIPOS[String(e.params.type)] ?? String(e.params.type)}.`);
    case 'minimum':
    case 'maximum':
      return new Error(`O campo "${campo}" deve ser ${e.keyword === 'minimum' ? 'no mínimo' : 'no máximo'} ${String(e.params.limit)}.`);
    case 'pattern':
      return new Error(`O campo "${campo}" não está no formato esperado (${String(e.params.pattern)}).`);
    case 'format':
      return new Error(`O campo "${campo}" deve ser data e hora ISO 8601 com fuso (ex.: 2026-11-06T12:00:00-03:00).`);
    case 'minLength':
      return new Error(`O campo "${campo}" não pode ser vazio.`);
    default:
      return new Error(`O campo "${campo}" é inválido: ${e.message ?? e.keyword}.`);
  }
}

/** Monta o app sem ligar porta: os testes usam `app.inject`. */
export async function montarApp(deps: DepsDoApp): Promise<FastifyInstance> {
  const app = Fastify({
    logger: deps.logger ?? false,
    schemaErrorFormatter: (erros) => formatarErroDeSchema(erros as never),
  }).withTypeProvider<TypeBoxTypeProvider>() as unknown as FastifyTypeBox;

  await app.register(swagger, {
    openapi: {
      openapi: '3.1.0',
      info: {
        title: 'Elo Alertas',
        version: '1.0.0',
        description:
          'Serviço do Elo para o sensor e os avisos. Recebe as leituras da régua de nível (ESP32) e devolve, por município, os avisos do INMET. Respostas em JSON UTF-8, datas em ISO 8601.',
      },
      components: {
        securitySchemes: {
          chaveDispositivo: {
            type: 'apiKey',
            in: 'header',
            name: 'X-Chave-Dispositivo',
            description: 'Chave do ESP32 da régua. O banco guarda só o hash sha256.',
          },
        },
      },
      tags: [
        { name: 'sistema', description: 'Saúde do serviço' },
        { name: 'sensor', description: 'Régua de nível e leituras' },
        { name: 'avisos', description: 'Avisos meteorológicos do INMET por município' },
      ],
    },
  });
  await app.register(swaggerUi, { routePrefix: '/docs' });

  app.setErrorHandler((erro: Error, req, reply) => {
    if (erro instanceof ErroDeDominio) {
      return reply.code(STATUS_POR_CODIGO[erro.codigo] ?? 400).send({ erro: erro.codigo, mensagem: erro.mensagem });
    }
    const status = (erro as { statusCode?: number }).statusCode ?? 500;
    if (status >= 400 && status < 500) {
      return reply.code(status).send({ erro: 'dado_invalido', mensagem: erro.message });
    }
    req.log.error(erro);
    return reply.code(500).send({ erro: 'erro_interno', mensagem: 'Erro interno do serviço.' });
  });

  app.setNotFoundHandler((_req, reply) =>
    reply.code(404).send({ erro: 'nao_encontrado', mensagem: 'Rota não encontrada.' }),
  );

  const agora = deps.agora ?? (() => new Date());
  const sincronizar = criarSincronizadorDeAvisos({ fonte: deps.fonteDeAvisos, avisos: deps.avisos, agora });

  rotasDeSaude(app, deps);
  rotasDeReguas(app, deps, agora);
  rotasDeLeituras(app, deps, agora);
  rotasDeAvisos(app, deps, { sincronizar, agora });

  return app;
}
