import { describe, expect, it } from "vitest";
import { getStudentModulesByUser, summarizeStudentStudyTime } from "@shared/supervision";

const completedAt = new Date("2026-10-17T12:00:00.000Z");

describe("resumo docente por aluno", () => {
  it("mantém módulos e tempos separados por identidade e calcula minutos pelo total real do módulo", () => {
    const result = getStudentModulesByUser([
      { id: 1, userId: 1, moduleId: "matriz", moduleTitle: "Matriz", progress: 50, stepIndex: 2, updatedAt: completedAt },
      { id: 2, userId: 2, moduleId: "torno", moduleTitle: "Torno", progress: 25, stepIndex: 1, updatedAt: completedAt },
    ], [
      { userId: 1, moduleId: "matriz", stepIndex: 1, elapsedSeconds: 180, completedAt, stepTitle: "Preparar máquina" },
      { userId: 1, moduleId: "matriz", stepIndex: 0, elapsedSeconds: 60, completedAt, stepTitle: "Material bruto" },
      { userId: 2, moduleId: "torno", stepIndex: 0, elapsedSeconds: 120, completedAt, stepTitle: "Conhecer o torno" },
    ]);

    expect(result.get(1)).toEqual([{
      moduleId: "matriz",
      title: "Matriz",
      progress: 50,
      studiedSeconds: 240,
      studiedMinutes: 4,
      stepTimes: [
        { stepIndex: 0, title: "Material bruto", elapsedSeconds: 60, completedAt },
        { stepIndex: 1, title: "Preparar máquina", elapsedSeconds: 180, completedAt },
      ],
    }]);
    expect(result.get(2)?.[0].studiedSeconds).toBe(120);
    expect(result.get(1)?.[0].stepTimes).not.toEqual(result.get(2)?.[0].stepTimes);
  });

  it("não duplica módulos quando existem linhas legadas de progresso do mesmo usuário", () => {
    const modules = getStudentModulesByUser([
      { id: 11, userId: 3, moduleId: "matriz", moduleTitle: "Matriz", progress: 25, stepIndex: 1, updatedAt: completedAt },
      { id: 12, userId: 3, moduleId: "matriz", moduleTitle: "Matriz", progress: 50, stepIndex: 2, updatedAt: new Date(completedAt.getTime() + 1000) },
    ], [
      { userId: 3, moduleId: "matriz", stepIndex: 0, elapsedSeconds: 30, completedAt, stepTitle: "Primeira" },
      { userId: 3, moduleId: "matriz", stepIndex: 1, elapsedSeconds: 30, completedAt, stepTitle: "Segunda" },
      { userId: 3, moduleId: "matriz", stepIndex: 2, elapsedSeconds: 900, completedAt, stepTitle: null },
    ]).get(3)!;

    expect(modules).toHaveLength(1);
    expect(modules[0]).toMatchObject({ progress: 50, studiedSeconds: 60, studiedMinutes: 1 });
    expect(modules[0].stepTimes.map((step) => step.stepIndex)).toEqual([0, 1]);
    expect(summarizeStudentStudyTime(modules)).toEqual({ studiedSeconds: 60, studiedMinutes: 1 });
  });

  it("não arredonda cada sessão curta para um minuto separado", () => {
    const modules = getStudentModulesByUser([
      { userId: 4, moduleId: "matriz", moduleTitle: "Matriz", progress: 100, stepIndex: 2, updatedAt: completedAt },
      { userId: 4, moduleId: "torno", moduleTitle: "Torno", progress: 50, stepIndex: 1, updatedAt: completedAt },
    ], [
      { userId: 4, moduleId: "matriz", stepIndex: 0, elapsedSeconds: 30, completedAt, stepTitle: "Primeira" },
      { userId: 4, moduleId: "matriz", stepIndex: 1, elapsedSeconds: 30, completedAt, stepTitle: "Segunda" },
      { userId: 4, moduleId: "torno", stepIndex: 0, elapsedSeconds: 30, completedAt, stepTitle: "Terceira" },
    ]).get(4)!;

    expect(modules.find((module) => module.moduleId === "matriz"))?.toMatchObject({ studiedSeconds: 60, studiedMinutes: 1 });
    expect(summarizeStudentStudyTime(modules)).toEqual({ studiedSeconds: 90, studiedMinutes: 2 });
  });

  it("ignora tempo inválido e sessões além da progressão confirmada", () => {
    const modules = getStudentModulesByUser([
      { userId: 5, moduleId: "matriz", moduleTitle: "Matriz", progress: 50, stepIndex: 1, updatedAt: completedAt },
    ], [
      { userId: 5, moduleId: "matriz", stepIndex: 0, elapsedSeconds: 86_401, completedAt, stepTitle: "Inválida" },
      { userId: 5, moduleId: "matriz", stepIndex: 1, elapsedSeconds: 60, completedAt, stepTitle: "Ainda não confirmada" },
      { userId: 5, moduleId: "matriz", stepIndex: 0, elapsedSeconds: 60, completedAt, stepTitle: null },
    ]).get(5)!;

    expect(modules[0]).toMatchObject({ studiedSeconds: 0, studiedMinutes: 0, stepTimes: [] });
  });
});
