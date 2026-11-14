# Registro do uso de IA (prompts.md)

Transparência: **a estrutura deste serviço foi gerada com IA** (Claude Code, da Anthropic), a partir do pedido do João para montar o backend de SOA do Elo (sensor e avisos) em TypeScript. O que a IA gerou:

- a estrutura de pastas em camadas (domínio, aplicação, infra e HTTP);
- o schema do banco, as duas migrações e o seed;
- as rotas, a documentação Swagger, os testes de unidade e de integração;
- o README, o `docker-compose.yml` e os arquivos de evidência.

A IA decidiu sozinha alguns detalhes que a equipe precisa conferir: a porta 3040 do serviço, a tolerância de 5 minutos para leituras no futuro, o arredondamento da bateria para inteiro, o mesmo 401 para chave errada e régua inexistente, e o descarte de respostas do INMET em formato irreconhecível (para não apagar o cache).

**Todos os integrantes precisam saber explicar o código** que está no repositório, na entrevista e na apresentação. Quem não entender uma parte deve pedir explicação à equipe ou estudar o arquivo antes de entregar.

## O que a equipe precisa fazer

- [ ] Rodar o serviço do zero seguindo o README e conferir cada rota no Swagger (`/docs`).
- [ ] Ler `src/dominio` e `src/aplicacao` até conseguir explicar o caminho de uma leitura (ESP32, rota, caso de uso, banco) e o de um aviso (INMET, cache, resposta).
- [ ] Combinar com o grupo do ESP32 o formato do `POST /leituras` e a chave do dispositivo.
- [ ] Tirar o print do Swagger e preencher nomes, RM e o link do vídeo no README.

## Registro da equipe

Anotem aqui cada uso de IA durante o projeto. Uma linha por uso.

| Data | Quem | Ferramenta | O que foi pedido | O que usamos | O que mudamos ou corrigimos |
| --- | --- | --- | --- | --- | --- |
| 06/11/2026 | João | Claude Code | Montar o serviço de SOA (sensor e avisos) em TypeScript | Estrutura inteira do serviço | A conferir |
| 14/11/2026 | João | Claude Code | Atualizar o serviço para receber os dados do painel web de administração | Localização, rua, município e nível de atenção na régua (migração, seed, `GET /regua`, `GET /reguas?codigoIbge=`), testes, evidências e README | A conferir |
|  |  |  |  |  |  |
