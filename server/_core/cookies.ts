import type { CookieOptions, Request } from "express";

function isSecureRequest(req: Pick<Request, "protocol" | "headers">) {
  if (req.protocol === "https") return true;
  const forwardedProto = req.headers["x-forwarded-proto"];
  if (!forwardedProto) return false;
  const protoList = Array.isArray(forwardedProto) ? forwardedProto : forwardedProto.split(",");
  return protoList.some(proto => proto.trim().toLowerCase() === "https");
}

/**
 * Cookie de sessão: httpOnly (inacessível ao JavaScript), SameSite=Lax (protege
 * contra CSRF entre sites e funciona em http://localhost) e Secure quando a
 * requisição chega por HTTPS.
 *
 * O projeto original usava SameSite=None sem Secure em HTTP, combinação que os
 * navegadores descartam — o login não persistia fora do ambiente de prévia.
 */
export function getSessionCookieOptions(
  req: Pick<Request, "protocol" | "headers">
): Pick<CookieOptions, "domain" | "httpOnly" | "path" | "sameSite" | "secure"> {
  return {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: isSecureRequest(req),
  };
}
