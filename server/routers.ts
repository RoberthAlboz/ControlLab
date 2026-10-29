import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { systemRouter } from "./_core/systemRouter";
import { moduleEditorProcedure, protectedProcedure, router, studentProcedure, teacherProcedure } from "./_core/trpc";
import { assignStudentBadge, deleteLearningModule, getCatalog, getNotesOfStudent, getStudentBadges, getStudentNotes,getTeacherBadgeData, isUploadReferenced, LearningDomainError, removeStudentBadge, replaceLearningSchedule, resetStudentModuleProgress, saveLearningModule, saveStudentNotes, setUserAvatar, startStudentStep, updateProgress } from "./db";
import { parseInlineImage, persistImageReference } from "./content-assets";
import { isSupportedModelUrl } from "@shared/model-url";
import { isAllowedAttachmentName, isHttpsUrl, isLinkAttachment, MAX_ATTACHMENT_BYTES, MAX_ATTACHMENT_NAME_LENGTH, MAX_ATTACHMENTS_PER_ITEM } from "@shared/attachments";
import { isLocalUploadUrl, storageDeleteUrl, storagePut } from "./storage";
import { CLASS_PERIOD_MS, createPeriodDate, isSchoolDate } from "@shared/class-schedule";
import { MAX_ELAPSED_SECONDS } from "@shared/progress";
import { parseStoredNotes } from "@shared/notes";
import { dateKeyInZone } from "@shared/time-zone";
import { isAdminRole } from "@shared/roles";
import { ENV } from "./_core/env";
import { authRouter } from "./auth";
import { inventoryRouter } from "./inventoryRouter";
import { adminRouter } from "./adminRouter";

/** Converte erros de domínio do ensino em respostas tRPC legíveis. */
async function runLearning<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof LearningDomainError) throw new TRPCError({ code: error.code, message: error.message, cause: error });
    throw error;
  }
}

/** Apaga arquivos enviados que nenhum módulo, etapa ou perfil usa mais. Falhas só vão para o log. */
async function deleteUnusedUploads(urls: Array<string | null | undefined>) {
  for (const url of Array.from(new Set(urls))) {
    if (!url || !isLocalUploadUrl(url)) continue;
    try {
      if (!(await isUploadReferenced(url))) await storageDeleteUrl(url);
    } catch (error) {
      console.warn("[Uploads] Não foi possível apagar", url, error instanceof Error ? error.message : error);
    }
  }
}

const MAX_NOTES_JSON_LENGTH = 900_000;

const noteInput = z.object({
  id: z.string().trim().min(1).max(64),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodId: z.number().int().min(1).max(12),
  subject: z.string().max(120),
  title: z.string().max(300),
  body: z.string().max(20_000),
  updatedAt: z.string().max(40),
});

/** Diário salvo → lista validada; `notes: null` quando nunca foi salvo. */
function readSavedNotes(saved: { content: string; updatedAt: Date } | null) {
  if (!saved) return { notes: null, updatedAt: null };
  let raw: unknown = [];
  try {
    raw = JSON.parse(saved.content);
  } catch {
    raw = [];
  }
  return { notes: parseStoredNotes(raw, dateKeyInZone(new Date(), ENV.timeZone)), updatedAt: saved.updatedAt };
}

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

// Arquivos chegam já enviados (rota de upload); aqui só aceitamos URLs do próprio
// servidor ou links HTTPS externos (ex.: pasta compartilhada no Drive).
const attachmentInput = z.object({
  id: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(MAX_ATTACHMENT_NAME_LENGTH),
  url: z.string().trim().max(2048).refine((value) => isLocalUploadUrl(value) || isHttpsUrl(value), "Anexo com endereço inválido."),
  size: z.number().int().min(0).max(MAX_ATTACHMENT_BYTES),
  mimeType: z.string().trim().max(160),
}).refine((attachment) => isLinkAttachment(attachment) || isAllowedAttachmentName(attachment.name), "Tipo de arquivo não permitido.");
const attachmentsInput = z.array(attachmentInput).max(MAX_ATTACHMENTS_PER_ITEM).default([]);

const stepInput = z.object({
  id: z.string().trim().min(1).max(64),
  title: z.string().trim().min(1).max(180),
  description: z.string().trim().max(4000),
  tip: z.string().trim().max(2000),
  image: imageReferenceInput,
  attachments: attachmentsInput,
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
  attachments: attachmentsInput,
});
const moduleInput = z.object({
  id: z.string().trim().min(1).max(64),
  code: z.string().trim().min(1).max(32),
  title: z.string().trim().min(1).max(180),
  kind: z.string().trim().min(1, "Informe o tipo do módulo.").max(40),
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
    // Exige sessão: módulos, etapas, anexos e agenda não ficam abertos a visitantes.
    catalog: protectedProcedure.input(z.object({ period: z.enum(["all", "today", "week", "month"]).default("all"), identityKey: z.union([z.string(), z.number().int()]).optional() }).optional()).query(({ ctx, input }) => getCatalog(ctx.user?.id, input?.period ?? "all", ctx.user?.role ?? null)),
    saveModule: moduleEditorProcedure.input(moduleInput).mutation(async ({ ctx, input }) => {
      const ownerPath = `learning-modules/${ctx.user.id}`;
      const moduleWithStoredImages = {
        ...input,
        coverImage: await persistImageReference(input.coverImage, `${ownerPath}/${crypto.randomUUID()}`),
        steps: await Promise.all(input.steps.map(async (step) => ({
          ...step,
          image: await persistImageReference(step.image, `${ownerPath}/${crypto.randomUUID()}`),
        }))),
      };
      // Arquivos recém-gravados que não chegaram ao banco (erro no save) são apagados.
      const inputImages = [input.coverImage, ...input.steps.map((step) => step.image)];
      const uploadedNow = [moduleWithStoredImages.coverImage, ...moduleWithStoredImages.steps.map((step) => step.image)]
        .filter((_url, index) => inputImages[index]?.startsWith("data:"));
      let removedImages: string[];
      try {
        ({ removedImages } = await runLearning(() => saveLearningModule(moduleWithStoredImages, ctx.user)));
      } catch (error) {
        await deleteUnusedUploads(uploadedNow);
        throw error;
      }
      await deleteUnusedUploads(removedImages);
      return { success: true } as const;
    }),
    saveSchedule: teacherProcedure.input(scheduleInput).mutation(async ({ ctx, input }) => {
      // A administração só visualiza o calendário escolar; quem agenda são os docentes.
      if (isAdminRole(ctx.user.role)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "A administração só visualiza o calendário escolar." });
      }
      const entries = input.map((entry) => {
        const startsAt = createPeriodDate(entry.date, entry.periodId);
        return { ...entry, startsAt, endsAt: new Date(startsAt.getTime() + CLASS_PERIOD_MS) };
      });
      await runLearning(() => replaceLearningSchedule(entries, ctx.user));
      return { success: true } as const;
    }),
    deleteModule: moduleEditorProcedure.input(z.object({ moduleId: z.string().min(1).max(64) })).mutation(async ({ ctx, input }) => {
      await runLearning(() => deleteLearningModule(input.moduleId, ctx.user));
      return { success: true } as const;
    }),
    startStep: studentProcedure.input(z.object({ moduleId: z.string().min(1).max(64), stepIndex: z.number().int().min(0) })).mutation(({ ctx, input }) =>
      runLearning(() => startStudentStep(ctx.user.id, input.moduleId, input.stepIndex))),
    updateProgress: studentProcedure.input(z.object({ moduleId: z.string().min(1).max(64), stepIndex: z.number().int().min(0), elapsedSeconds: z.number().int().min(0).max(MAX_ELAPSED_SECONDS).default(0) })).mutation(({ ctx, input }) =>
      runLearning(() => updateProgress(ctx.user.id, input.moduleId, input.stepIndex, input.elapsedSeconds))),
    resetStudentModule: teacherProcedure.input(z.object({ studentId: z.number().int().positive(), moduleId: z.string().min(1).max(64) })).mutation(({ ctx, input }) =>
      runLearning(() => resetStudentModuleProgress(input.studentId, input.moduleId, ctx.user))),
  }),
  /** Diário de aula do aluno, guardado no banco (antes ficava só no navegador). */
  notes: router({
    mine: protectedProcedure.query(async ({ ctx }) => readSavedNotes(await getStudentNotes(ctx.user.id))),
    /** Docente consulta o diário de um aluno das turmas dele (somente leitura). */
    ofStudent: teacherProcedure.input(z.object({ studentId: z.number().int().positive() })).query(async ({ ctx, input }) => {
      const found = await runLearning(() => getNotesOfStudent(input.studentId, ctx.user));
      if (!found) throw new TRPCError({ code: "NOT_FOUND", message: "Aluno não encontrado." });
      return { student: found.student, ...readSavedNotes(found.saved) };
    }),
    save: studentProcedure.input(z.object({ notes: z.array(noteInput).max(2_000) })).mutation(async ({ ctx, input }) => {
      const content = JSON.stringify(input.notes);
      if (content.length > MAX_NOTES_JSON_LENGTH) {
        throw new TRPCError({ code: "PAYLOAD_TOO_LARGE", message: "As anotações passaram do limite de tamanho. Apague anotações antigas para continuar salvando." });
      }
      return saveStudentNotes(ctx.user.id, content);
    }),
  }),
  badges: router({
    mine: studentProcedure.input(z.object({ identityKey: z.union([z.string(), z.number().int()]).optional() }).optional()).query(({ ctx }) => getStudentBadges(ctx.user.id)),
    adminData: teacherProcedure.input(z.object({ identityKey: z.union([z.string(), z.number().int()]).optional() }).optional()).query(({ ctx }) => getTeacherBadgeData(ctx.user)),
    assign: teacherProcedure.input(z.object({
      studentId: z.number().int().positive(),
      label: z.string().trim().min(1).max(100),
      detail: z.string().trim().max(500).default(""),
    })).mutation(async ({ ctx, input }) => {
      await runLearning(() => assignStudentBadge(input, ctx.user));
      return { success: true } as const;
    }),
    remove: teacherProcedure.input(z.object({ badgeId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      await runLearning(() => removeStudentBadge(input.badgeId, ctx.user));
      return { success: true } as const;
    }),
  }),
  inventory: inventoryRouter,
  admin: adminRouter,
  profile: router({
    uploadAvatar: protectedProcedure.input(z.object({
      dataUrl: z.string().regex(/^data:image\/(jpeg|jpg|png|webp);base64,/).max(7_000_000),
      mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
    })).mutation(async ({ ctx, input }) => {
      const parsed = parseInlineImage(input.dataUrl, input.mimeType);
      const extension = parsed.mimeType === "image/jpeg" ? "jpg" : parsed.mimeType.split("/")[1];
      const uploaded = await storagePut(`${ctx.user.id}-profile/avatar.${extension}`, parsed.bytes, parsed.mimeType);
      const { previousAvatarUrl } = await setUserAvatar(ctx.user.id, uploaded.url);
      await deleteUnusedUploads([previousAvatarUrl]);
      return { avatarUrl: uploaded.url };
    }),
  }),
});

export type AppRouter = typeof appRouter;
