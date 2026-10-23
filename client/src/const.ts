export { COOKIE_NAME } from "@shared/const";

export const LOGIN_PATH = "/login";

/** Caminho atual (para voltar a ele depois do login). */
export function currentPathForRedirect() {
  if (typeof window === "undefined") return "/";
  const { pathname, search } = window.location;
  return pathname.startsWith(LOGIN_PATH) ? "/" : `${pathname}${search}`;
}

/** Monta a URL da tela de login preservando a página de origem. */
export function loginUrl(next = currentPathForRedirect()) {
  return next && next !== "/" ? `${LOGIN_PATH}?next=${encodeURIComponent(next)}` : LOGIN_PATH;
}
