import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router, studentProcedure, teacherProcedure } from "./_core/trpc";
import { assignStudentBadge, deleteLearningModule, getCatalog, getStudentBadges, getTeacherBadgeData, LearningDomainError, removeStudentBadge, replaceLearningSchedule, resetStudentModuleProgress, saveLearningModule, setUserAvatar, startStudentStep, updateProgress } from "./db";
import { parseInlineImage, persistImageReference } from "./content-assets";
import { isSupportedModelUrl } from "@shared/model-url";
import { isLocalUploadUrl, storagePut } from "./storage";
import { CLASS_PERIOD_MS, createPeriodDate, isSchoolDate } from "@shared/class-schedule";
import { MAX_ELAPSED_SECONDS } from "@shared/progress";
import { authRouter } from "./auth";
import { inventoryRouter } from "./inventoryRouter";

const imageReferenceInput = z.string().max(7_000_000).nullable().optional().refine((value) => {
  if (value == null) return true;
  if (value.startsWith("data:")) return /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value);
  if (value.startsWith("/uploads/")) return isLocalUploadUrl(value);
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}, "Use uma imagem HTTPS ou um arquivo de imagem válido.");

const stepInput = z.object({
  id: z.string().trim().min(1).max(64),
  title: z.string().trim().min(1).max(180),
  description: z.string().trim().max(4000),
  tip: z.string().trim().max(2000),
  image: imageReferenceInput,
});
const resourceInput = z.object({
  id: z.string().trim().min(1).max(64),
  category: z.enum(["materials", "machines", "tools", "parts"]),
  label: z.string().trim().min(1).max(80),
  title: z.string().trim().min(1).max(180),
  detail: z.string().trim().max(2000),
  status: z.string().trim().max(80),
  progress: z.number().int().min(0).max(100),
  modelUrl: z.string().trim().max(2048).refine((value) => value === "" || isSupportedModelUrl(value), "Informe uma URL HTTPS pública terminada em .glb ou .gltf, ou deixe o campo vazio."),
  color: z.string().trim().max(32),
  inventoryItemId: z.number().int().positive().nullable().optional(),
});
const moduleInput = z.object({
  id: z.string().trim().min(1).max(64),
  code: z.string().trim().min(1).max(32),
  title: z.string().trim().min(1).max(180),
  kind: z.enum(["Ferramenta", "Montagem", "Processo"]),
  description: z.string().trim().max(4000),
  objective: z.string().trim().max(2000),
  cover: z.string().trim().max(32),
  coverImage: imageReferenceInput,
  progress: z.number().int().min(0).max(100),
  duration: z.string().trim().max(32),
  published: z.boolean(),
  confirmStepStructureReset: z.boolean().optional(),
  steps: z.array(stepInput).max(100),
  resources: z.array(resourceInput).max(100),
}).superRefine((module, ctx) => {
  const stepIds = new Set<string>();
  const resourceIds = new Set<string>();
  module.steps.forEach((step, index) => {
    if (stepIds.has(step.id)) ctx.addIssue({ code: "custom", path: ["steps", index, "id"], message: "Cada etapa precisa de um identificador único." });
    stepIds.add(step.id);
    if (!step.title.trim()) ctx.addIssue({ code: "custom", path: ["steps", index, "title"], message: "Informe o título da etapa." });
  });
  module.resources.forEach((resource, index) => {
    if (resourceIds.has(resource.id)) ctx.addIssue({ code: "custom", path: ["resources", index, "id"], message: "Cada recurso precisa de um identificador único." });
    resourceIds.add(resource.id);
  });
  if (module.published) {
    if (!module.description.trim()) ctx.addIssue({ code: "custom", path: ["description"], message: "Descreva o módulo antes de publicar." });
    if (!module.objective.trim()) ctx.addIssue({ code: "custom", path: ["objective"], message: "Informe o objetivo antes de publicar." });
    if (!module.steps.length) ctx.addIssue({ code: "custom", path: ["steps"], message: "Um módulo publicado precisa ter pelo menos uma etapa." });
  }
});

const scheduleEntryInput = z.object({
  id: z.string().min(1).max(64),
  moduleId: z.string().trim().min(1, "Selecione o módulo da atividade.").max(64),
  title: z.string().trim().min(1).max(180),
  subtitle: z.string().max(180),
  activityType: z.enum(["aula", "laboratorio", "avaliacao"]),
  color: z.string().max(32),
  date: z.string().refine(isSchoolDate, "Escolha um dia letivo de segunda a sexta."),
  periodId: z.number().int().min(1).max(12),
});

const scheduleInput = z.array(scheduleEntryInput).max(250).superRefine((entries, ctx) => {
  const occupiedSlots = new Set<string>();
  const ids = new Set<string>();
  entries.forEach((entry, index) => {
    const slot = `${entry.date}:${entry.periodId}`;
    if (occupiedSlots.has(slot)) ctx.addIssue({ code: "custom", path: [index, "periodId"], message: "Já existe uma atividade neste dia e horário." });
    if (ids.has(entry.id)) ctx.addIssue({ code: "custom", path: [index, "id"], message: "Cada atividade precisa de um identificador único." });
    occupiedSlots.add(slot);
    ids.add(entry.id);
  });
});

export const appRouter = router({
  system: systemRouter,
  auth: authRouter,
  learning: router({
    catalog: publicProcedure.input(z.object({ period: z.enum(["all", "today", "week", "month"]).default("all"), identityKey: z.union([z.string(), z.number().int()]).optional() }).optional()).query(({ ctx, input }) => getCatalog(ctx.user?.id, input?.period ?? "all", ctx.user?.role ?? null)),
    saveModule: teacherProcedure.input(moduleInput).mutation(async ({ ctx, input }) => {
      const ownerPath = `learning-modules/${ctx.user.id}`;
      const moduleWithStoredImages = {
        ...input,
        coverImage: await persistImageReference(input.coverImage, `${ownerPath}/${crypto.randomUUID()}`),
        steps: await Promise.all(input.steps.map(async (step) => ({
          ...step,
          image: await persistImageReference(step.image, `${ownerPath}/${crypto.randomUUID()}`),
        }))),
      };
      await saveLearningModule(moduleWithStoredImages, ctx.user.id);
      return { success: true } as const;
    }),
    saveSchedule: teacherProcedure.input(scheduleInput).mutation(async ({ input }) => {
      const entries = input.map((entry) => {
        const startsAt = createPeriodDate(entry.date, entry.periodId);
        return { ...entry, startsAt, endsAt: new Date(startsAt.getTime() + CLASS_PERIOD_MS) };
      });
      try {
        await replaceLearningSchedule(entries);
      } catch (error) {
        if (error instanceof LearningDomainError) throw new TRPCError({ code: error.code, message: error.message });
        throw error;
      }
      return { success: true } as const;
    }),
    deleteModule: teacherProcedure.input(z.object({ moduleId: z.string().min(1).max(64) })).mutation(async ({ input }) => {
      try {
        await deleteLearningModule(input.moduleId);
        return { success: true } as const;
      } catch (error) {
        if (error instanceof LearningDomainError) throw new TRPCError({ code: error.code, message: error.message });
        throw error;
      }
    }),
    startStep: studentProcedure.input(z.object({ moduleId: z.string().min(1).max(64), stepIndex: z.number().int().min(0) })).mutation(async ({ ctx, input }) => {
      try {
        return await startStudentStep(ctx.user!.id, input.moduleId, input.stepIndex);
      } catch (error) {
        if (error instanceof LearningDomainError) throw new TRPCError({ code: error.code, message: error.message });
        throw error;
      }
    }),
    updateProgress: studentProcedure.input(z.object({ moduleId: z.string().min(1).max(64), stepIndex: z.number().int().min(0), elapsedSeconds: z.number().int().min(0).max(MAX_ELAPSED_SECONDS).default(0) })).mutation(async ({ ctx, input }) => {
      try {
        return await updateProgress(ctx.user!.id, input.moduleId, input.stepIndex, input.elapsedSeconds);
      } catch (error) {
        if (error instanceof LearningDomainError) throw new TRPCError({ code: error.code, message: error.message });
        throw error;
      }
    }),
    resetStudentModule: teacherProcedure.input(z.object({ studentId: z.number().int().positive(), moduleId: z.string().min(1).max(64) })).mutation(async ({ input }) => {
      try {
        return await resetStudentModuleProgress(input.studentId, input.moduleId);
      } catch (error) {
        if (error instanceof LearningDomainError) throw new TRPCError({ code: error.code, message: error.message });
        throw error;
      }
    }),
  }),
  badges: router({
    mine: studentProcedure.input(z.object({ identityKey: z.union([z.string(), z.number().int()]).optional() }).optional()).query(({ ctx }) => getStudentBadges(ctx.user.id)),
    adminData: teacherProcedure.input(z.object({ identityKey: z.union([z.string(), z.number().int()]).optional() }).optional()).query(() => getTeacherBadgeData()),
    assign: teacherProcedure.input(z.object({
      studentId: z.number().int().positive(),
      label: z.string().trim().min(1).max(100),
      detail: z.string().trim().max(500).default(""),
    })).mutation(async ({ ctx, input }) => {
      await assignStudentBadge(input, ctx.user.id);
      return { success: true } as const;
    }),
    remove: teacherProcedure.input(z.object({ badgeId: z.number().int().positive() })).mutation(async ({ input }) => {
      await removeStudentBadge(input.badgeId);
      return { success: true } as const;
    }),
  }),
  inventory: inventoryRouter,
  profile: router({
    uploadAvatar: protectedProcedure.input(z.object({
      dataUrl: z.string().regex(/^data:image\/(jpeg|jpg|png|webp);base64,/).max(7_000_000),
      mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
    })).mutation(async ({ ctx, input }) => {
      const parsed = parseInlineImage(input.dataUrl, input.mimeType);
      const extension = parsed.mimeType === "image/jpeg" ? "jpg" : parsed.mimeType.split("/")[1];
      const uploaded = await storagePut(`${ctx.user.id}-profile/avatar.${extension}`, parsed.bytes, parsed.mimeType);
      await setUserAvatar(ctx.user.id, uploaded.url);
      return { avatarUrl: uploaded.url };
    }),
  }),
});

export type AppRouter = typeof appRouter;
