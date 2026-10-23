/**
 * Mutex das transações, comum ao SQLite e ao Postgres.
 *
 * Os dois drivers usam uma única conexão, então as transações são serializadas:
 *  - uma transação por vez (BEGIN … COMMIT);
 *  - consultas fora da transação esperam ela terminar, para não entrarem
 *    no meio dela (AsyncLocalStorage identifica quem está dentro).
 */
import { AsyncLocalStorage } from "node:async_hooks";

/** Métodos que o driver `sqlite-proxy` do Drizzle pede ao banco. */
export type DriverMethod = "run" | "all" | "values" | "get";

const transactionContext = new AsyncLocalStorage<true>();
let queue: Promise<void> = Promise.resolve();
let activeTransaction: Promise<void> | null = null;

export function isInsideTransaction() {
  return transactionContext.getStore() === true;
}

/** Fora de transação: espera a transação em curso terminar. */
export async function waitOutsideTransaction() {
  if (isInsideTransaction()) return;
  while (activeTransaction) await activeTransaction;
}

/** Converte os parâmetros para os tipos gravados no banco (datas em ms, booleanos 0/1). */
export function normalizeParam(value: unknown): unknown {
  if (value === undefined) return null;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (value instanceof Date) return value.getTime();
  return value;
}

/**
 * Envolve uma transação do Drizzle: garante exclusividade e marca o contexto
 * assíncrono para que as consultas dela não esperem por si mesmas.
 */
export function runExclusive<T>(work: () => Promise<T>): Promise<T> {
  if (isInsideTransaction()) return work(); // transação aninhada (savepoint)
  const previous = queue;
  let release!: () => void;
  const done = new Promise<void>(resolve => {
    release = resolve;
  });
  queue = previous.then(() => done);
  return previous.then(async () => {
    activeTransaction = done;
    try {
      return await transactionContext.run(true, work);
    } finally {
      activeTransaction = null;
      release();
    }
  });
}
