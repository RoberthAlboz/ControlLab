import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import { calculateGamification } from "./db";
import type { TrpcContext } from "./_core/context";
import { makeContext, makeUser } from "./test-utils";

function context(user: TrpcContext["user"]): TrpcContext {
  return makeContext(user).ctx;
}

const student = () => makeUser("student");
const teacher = () => makeUser("teacher");

const moduleInput = {
  id: "test-module",
  code: "MÓDULO TESTE",
  title: "Módulo de teste",
  kind: "Processo" as const,
  description: "Descrição",
  objective: "Objetivo",
  cover: "#ffffff",
  progress: 0,
  duration: "20 min",
  published: false,
  steps: [],
  resources: [],
};

const scheduleEntry = {
  id: "activity-test",
  moduleId: "matriz",
  title: "Aula de teste",
  subtitle: "Conteúdo",
  activityType: "aula" as const,
  color: "#b21e2b",
  date: "2026-10-09",
  periodId: 3,
};

describe("learning permissions", () => {
  it("calculates level progress from study time and completed steps", () => {
    expect(calculateGamification(0, 0)).toEqual({ level: 1, levelProgress: 0, xp: 0 });
    expect(calculateGamification(60, 2)).toEqual({ level: 2, levelProgress: 0, xp: 120 });
    expect(calculateGamification(120, 0)).toEqual({ level: 2, levelProgress: 0, xp: 120 });
  });

  it("blocks progress updates for anonymous visitors", async () => {
    const caller = appRouter.createCaller(context(null));
    await expect(caller.learning.startStep({ moduleId: "matriz", stepIndex: 0 })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.learning.updateProgress({ moduleId: "matriz", stepIndex: 1, elapsedSeconds: 30 })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.learning.resetStudentModule({ studentId: 7, moduleId: "matriz" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.profile.uploadAvatar({ dataUrl: "data:image/png;base64,ZmFrZQ==", mimeType: "image/png" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("blocks module writes for regular students", async () => {
    const caller = appRouter.createCaller(context(student()));
    await expect(caller.learning.saveModule(moduleInput)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.learning.deleteModule({ moduleId: "matriz" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.learning.resetStudentModule({ studentId: 8, moduleId: "matriz" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.learning.saveSchedule([scheduleEntry])).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("blocks student progress writes from the docente account", async () => {
    const caller = appRouter.createCaller(context(teacher()));
    await expect(caller.learning.startStep({ moduleId: "matriz", stepIndex: 0 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.learning.updateProgress({ moduleId: "matriz", stepIndex: 1, elapsedSeconds: 30 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects invalid and excessive elapsed time at the API boundary", async () => {
    const caller = appRouter.createCaller(context(student()));
    await expect(caller.learning.updateProgress({ moduleId: "matriz", stepIndex: 1, elapsedSeconds: -1 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.learning.updateProgress({ moduleId: "matriz", stepIndex: 1, elapsedSeconds: 86_401 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects weekends and duplicate activities in the same class period", async () => {
    const caller = appRouter.createCaller(context(teacher()));
    await expect(caller.learning.saveSchedule([{ ...scheduleEntry, date: "2026-10-10" }])).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.learning.saveSchedule([scheduleEntry, { ...scheduleEntry, id: "activity-duplicate" }])).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects activities without a module reference at the API boundary", async () => {
    const caller = appRouter.createCaller(context(teacher()));
    await expect(caller.learning.saveSchedule([{ ...scheduleEntry, moduleId: "" }])).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects insecure and unsupported 3D model URLs at the API boundary", async () => {
    const caller = appRouter.createCaller(context(teacher()));
    const invalidModule = {
      ...moduleInput,
      resources: [{ id: "resource", category: "tools" as const, label: "Ferramenta", title: "Modelo", detail: "Teste", status: "Novo", progress: 0, modelUrl: "http://example.com/tool.zip", color: "#111111" }],
    };
    await expect(caller.learning.saveModule(invalidModule)).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
