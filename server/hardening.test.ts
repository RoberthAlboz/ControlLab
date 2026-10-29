/**
 * Correções da revisão: limitador por IP, fuso da escola, empréstimos vencidos,
 * dono do conteúdo e atalho de login de desenvolvimento.
 */
import { describe, expect, it } from "vitest";
import { LoginRateLimiter } from "./_core/rate-limit";
import { dateKeyInZone, periodStartInZone, startOfZonedDay, studyStreakDays } from "@shared/time-zone";
import { isLoanOverdue } from "@shared/inventory";
import { canManageContent } from "./db";
import { isLoopbackRequest, systemRouter } from "./_core/systemRouter";
import { makeContext } from "./test-utils";
import type { TrpcContext } from "./_core/context";

const SP = "America/Sao_Paulo";

describe("limitador de login por IP", () => {
  it("bloqueia o IP que testa senhas em muitas contas diferentes", () => {
    const limiter = new LoginRateLimiter(5, 60_000, 60_000, () => 0, 3);
    limiter.registerFailure("a@x.br", "10.0.0.9");
    limiter.registerFailure("b@x.br", "10.0.0.9");
    limiter.registerFailure("c@x.br", "10.0.0.9");
    expect(limiter.retryAfterSeconds("d@x.br", "10.0.0.9")).toBe(60);
    expect(limiter.retryAfterSeconds("d@x.br", "10.0.0.10")).toBe(0);
  });

  it("login certo não zera o contador do IP", () => {
    const limiter = new LoginRateLimiter(5, 60_000, 60_000, () => 0, 2);
    limiter.registerFailure("a@x.br", "ip");
    limiter.registerSuccess("a@x.br", "ip");
    limiter.registerFailure("b@x.br", "ip");
    expect(limiter.retryAfterSeconds("c@x.br", "ip")).toBe(60);
  });

  it("remove entradas vencidas sozinho, sem crescer para sempre", () => {
    let now = 0;
    const limiter = new LoginRateLimiter(5, 1_000, 1_000, () => now);
    for (let index = 0; index < 600; index += 1) limiter.registerFailure(`u${index}@x.br`, `ip-${index}`);
    expect(limiter.size).toBe(1_200);
    now = 10_000;
    limiter.registerFailure("novo@x.br", "ip-novo");
    expect(limiter.size).toBe(2);
  });
});

describe("datas no fuso da escola", () => {
  it("estudo às 23h30 de Brasília conta para o próprio dia (não para o dia seguinte em UTC)", () => {
    const lateNight = new Date("2026-10-21T02:30:00Z"); // 20/10 23:30 em São Paulo
    expect(lateNight.toISOString().slice(0, 10)).toBe("2026-10-21");
    expect(dateKeyInZone(lateNight, SP)).toBe("2026-10-20");
  });

  it("'hoje' começa à meia-noite de Brasília", () => {
    expect(startOfZonedDay("2026-10-21", SP).toISOString()).toBe("2026-10-21T03:00:00.000Z");
    const now = new Date("2026-10-21T12:00:00Z");
    expect(periodStartInZone("today", now, SP).toISOString()).toBe("2026-10-21T03:00:00.000Z");
    expect(periodStartInZone("week", now, SP).toISOString()).toBe("2026-10-15T03:00:00.000Z");
    expect(periodStartInZone("month", now, SP).toISOString()).toBe("2026-10-01T03:00:00.000Z");
  });

  it("sequência de dias de estudo usa os dias de Brasília", () => {
    const now = new Date("2026-10-21T13:00:00Z"); // 21/10 10:00
    const days = [
      new Date("2026-10-21T02:30:00Z"), // 20/10 23:30
      new Date("2026-10-19T15:00:00Z"), // 19/10
      new Date("2026-10-18T15:00:00Z"), // 18/10
      new Date("2026-10-16T15:00:00Z"), // 16/10 (quebra)
    ];
    expect(studyStreakDays(days, now, SP)).toBe(3);
    expect(studyStreakDays([new Date("2026-10-18T15:00:00Z")], now, SP)).toBe(0);
    expect(studyStreakDays([], now, SP)).toBe(0);
  });
});

describe("empréstimos vencidos", () => {
  const past = new Date("2026-01-01T00:00:00Z");
  const now = new Date("2026-02-01T00:00:00Z").getTime();
  it("reserva nunca retirada também fica vencida", () => {
    expect(isLoanOverdue({ status: "reservado", dueAt: past }, now)).toBe(true);
    expect(isLoanOverdue({ status: "retirado", dueAt: past.toISOString() }, now)).toBe(true);
  });
  it("empréstimo encerrado ou sem data não vence", () => {
    expect(isLoanOverdue({ status: "devolvido", dueAt: past }, now)).toBe(false);
    expect(isLoanOverdue({ status: "retirado", dueAt: null }, now)).toBe(false);
  });
});

describe("dono do conteúdo", () => {
  it("docente altera o que criou ou o que não tem autor; administração altera tudo", () => {
    expect(canManageContent(2, { id: 2, role: "teacher" })).toBe(true);
    expect(canManageContent(null, { id: 2, role: "teacher" })).toBe(true);
    expect(canManageContent(3, { id: 2, role: "teacher" })).toBe(false);
    expect(canManageContent(3, { id: 1, role: "admin" })).toBe(true);
  });
});

describe("atalho de login de desenvolvimento", () => {
  function contextFrom(remoteAddress: string): TrpcContext {
    const { ctx } = makeContext(null);
    return { ...ctx, req: { ...ctx.req, socket: { remoteAddress } } as unknown as TrpcContext["req"] };
  }

  it("reconhece apenas o endereço do próprio computador", () => {
    expect(isLoopbackRequest({ socket: { remoteAddress: "127.0.0.1" } })).toBe(true);
    expect(isLoopbackRequest({ socket: { remoteAddress: "::1" } })).toBe(true);
    expect(isLoopbackRequest({ socket: { remoteAddress: "192.168.0.20" } })).toBe(false);
    expect(isLoopbackRequest({})).toBe(false);
  });

  it("nunca entrega senhas para quem acessa pela rede", async () => {
    const caller = systemRouter.createCaller(contextFrom("192.168.0.20"));
    await expect(caller.devAccounts()).resolves.toEqual([]);
    await expect(caller.info()).resolves.toEqual({ environment: "production" });
  });
});
