/**
 * Banco inacessível. Fica num módulo próprio (e não em db.ts) para que os
 * testes que substituem `./db` por um mock continuem reconhecendo o erro.
 */
export class DatabaseUnavailableError extends Error {
  constructor(message = "O banco de dados está indisponível no momento.") {
    super(message);
    this.name = "DatabaseUnavailableError";
  }
}

export const DATABASE_UNAVAILABLE_MESSAGE = "Serviço temporariamente indisponível. Tente novamente em instantes.";
