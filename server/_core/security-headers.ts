/** Cabeçalhos de segurança, compartilhados pelo servidor Express e pelo build da Vercel (sem dependências). */

/**
 * Só executa scripts do próprio servidor (nenhum inline: o tema inicial vem de
 * /theme-init.js). Estilos inline ficam liberados porque o React e as animações
 * usam `style=`. Imagens e modelos 3D podem vir de links HTTPS que o docente cadastra.
 */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "connect-src 'self' https:",
  "media-src 'self' blob: https:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
].join("; ");

/** Cabeçalhos de segurança de todas as respostas (a Vercel repete os mesmos nos arquivos estáticos). */
export const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "same-origin",
  "X-Frame-Options": "SAMEORIGIN",
};
