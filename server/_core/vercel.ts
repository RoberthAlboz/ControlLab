/**
 * Entrada da função da Vercel (empacotada por scripts/build-vercel.mjs).
 * A Vercel entrega os arquivos do frontend direto da CDN; esta função só
 * atende /api/* e /uploads/*. O banco é o Postgres do Supabase (DATABASE_URL)
 * e os arquivos enviados ficam na tabela stored_files.
 */
import { createApp } from "./app";
import { assertServerEnv } from "./env";

assertServerEnv();

export default createApp();
