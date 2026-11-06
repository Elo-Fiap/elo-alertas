/** Erro de regra de negócio. A camada HTTP traduz o código em status; o domínio não conhece HTTP. */
export abstract class ErroDeDominio extends Error {
  abstract readonly codigo: string;

  constructor(mensagem: string) {
    super(mensagem);
    this.name = new.target.name;
  }

  get mensagem(): string {
    return this.message;
  }
}

export class NaoEncontrado extends ErroDeDominio {
  readonly codigo = 'nao_encontrado';
}

export class ChaveInvalida extends ErroDeDominio {
  readonly codigo = 'chave_invalida';

  constructor(mensagem = 'Chave do dispositivo ausente ou inválida.') {
    super(mensagem);
  }
}

export class DadoInvalido extends ErroDeDominio {
  readonly codigo = 'dado_invalido';
}
