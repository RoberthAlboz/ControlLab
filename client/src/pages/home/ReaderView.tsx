import { useState, type ComponentProps } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Box,
  Check,
  Edit3,
  ExternalLink,
  ImagePlus,
  Lightbulb,
  LoaderCircle,
  Target,
  Warehouse,
} from "lucide-react";
import { STOCK_HEALTH_LABELS } from "@shared/inventory";
import { isStepCompleted } from "@shared/progress";
import { AttachmentList } from "@/components/ModuleAttachments";
import StepQuizPanel from "@/components/StepQuizPanel";
import ReaderTimeline from "@/components/forge/ReaderTimeline";
import CaliperGauge from "@/components/forge/CaliperGauge";
import ReaderKeyboard from "@/components/forge/ReaderKeyboard";
import {
  type Category,
  type DidacticModule,
  type Resource,
  StepTimerReadout,
} from "./shared";
import {
  completedStepCountOf,
  countResourcesByCategory,
  filterResources,
  moduleProgressReading,
  RESOURCE_CATEGORY_OPTIONS,
} from "./logic";

type TimerSession = ComponentProps<typeof StepTimerReadout>["session"];

/**
 * Leitor de um módulo: cabeçalho com progresso, linha do tempo das etapas,
 * conteúdo da etapa (dica, imagem, arquivos, quiz), controles e recursos.
 * O estado da etapa (timer, quiz, mutações) vem de Home, que fala com o servidor.
 */
export function ReaderView({
  module,
  stepIndex,
  onStepChange,
  isTeacher,
  timer,
  quiz,
  startPending,
  completePending,
  onStart,
  onComplete,
  onEdit,
  onBack,
}: {
  module: DidacticModule;
  stepIndex: number;
  onStepChange: (index: number) => void;
  isTeacher: boolean;
  timer: { session: TimerSession; running: boolean; completed: boolean };
  quiz: {
    passed: boolean;
    pending: boolean;
    onAnswer: ComponentProps<typeof StepQuizPanel>["onAnswer"];
  };
  startPending: boolean;
  completePending: boolean;
  onStart: () => void;
  onComplete: () => void;
  onEdit: () => void;
  onBack: () => void;
}) {
  const step = module.steps[stepIndex] || module.steps[0];
  const stepCount = module.steps.length;
  const completedStepCount = completedStepCountOf(module);
  const canGoNext =
    stepIndex < stepCount - 1 &&
    (isTeacher || stepIndex + 1 <= completedStepCount);
  const busy = startPending || completePending;
  return (
    <main className="clean-content reader-content rd">
      <ReaderKeyboard
        onPrevious={
          stepIndex > 0 ? () => onStepChange(stepIndex - 1) : undefined
        }
        onNext={canGoNext ? () => onStepChange(stepIndex + 1) : undefined}
      />
      <button type="button" className="back-library" onClick={onBack}>
        <ArrowLeft size={14} aria-hidden="true" /> Voltar para módulos
      </button>
      <header className="rd-header">
        <div className="reader-title">
          <div>
            <div className="breadcrumb">
              {module.code} <span>/</span> {module.kind.toUpperCase()}
            </div>
            <h1>{module.title}</h1>
            <p>{module.description}</p>
          </div>
          {isTeacher && (
            <button
              type="button"
              className="edit-module-button"
              onClick={onEdit}
            >
              <Edit3 size={14} aria-hidden="true" /> Editar conteúdo
            </button>
          )}
        </div>
        <div className="reader-overview">
          <div className="reader-objective">
            <span className="eyebrow">
              <Target size={13} aria-hidden="true" /> OBJETIVO DO MÓDULO
            </span>
            <p>{module.objective}</p>
          </div>
          <div className="reader-progress-summary">
            <div className="reader-progress-heading">
              <span className="eyebrow">PROGRESSO</span>
            </div>
            <CaliperGauge
              value={moduleProgressReading(module)}
              label="Progresso salvo do módulo"
              caption={`${completedStepCount} de ${stepCount} ${
                stepCount === 1 ? "etapa concluída" : "etapas concluídas"
              }`}
            />
          </div>
        </div>
      </header>
      <div className="content-grid reader-content-grid">
        <ReaderTimeline
          moduleId={module.id}
          steps={module.steps}
          activeIndex={stepIndex}
          canVisitThrough={completedStepCount}
          teacherMode={isTeacher}
          isRunning={timer.running}
          isCompleted={index =>
            isStepCompleted(index, completedStepCount) ||
            (index === stepIndex && timer.completed)
          }
          onSelect={onStepChange}
        />
        <section className="main-analysis">
          <div className="section-heading reader-carousel-heading">
            <div>
              <span className="eyebrow">
                {stepCount
                  ? `ETAPA ${String(stepIndex + 1).padStart(2, "0")} DE ${String(stepCount).padStart(2, "0")}`
                  : "SEM ETAPAS"}
              </span>
              <h2>{step?.title || "Conteúdo em preparação"}</h2>
            </div>
          </div>
          <div className="reader-instruction">
            <p>
              {step?.description ||
                "Este módulo ainda não tem etapas. Abra o editor docente para começar a escrever o conteúdo."}
            </p>
          </div>
          {(step?.tip || isTeacher) && (
            <aside className="rd-tip" aria-label="Dica do instrutor">
              <b className="rd-tip-icon" aria-hidden="true">
                <Lightbulb size={16} />
              </b>
              <div>
                <span className="eyebrow">DICA DO INSTRUTOR</span>
                <p>
                  {step?.tip ||
                    "Inclua uma dica prática para orientar o aluno."}
                </p>
              </div>
            </aside>
          )}
          {(step?.image || isTeacher) && (
            <figure
              key={step?.id || stepIndex}
              className={`reader-image-panel ${step?.image ? "has-image" : "is-empty"}`}
            >
              {step?.image ? (
                <>
                  <figcaption className="reader-image-caption">
                    IMAGEM DE REFERÊNCIA
                  </figcaption>
                  <img
                    className="reader-static-image"
                    src={step.image}
                    alt={`Imagem de apoio para ${step?.title || "a etapa"}`}
                    loading="lazy"
                  />
                </>
              ) : (
                <div
                  className="reader-image-empty"
                  role="status"
                  aria-live="polite"
                >
                  <ImagePlus size={24} aria-hidden="true" />
                  <strong>Imagem da etapa ainda não adicionada</strong>
                  <span>
                    {!step
                      ? "Esta etapa será configurada pelo docente."
                      : isTeacher
                        ? "Use Editar conteúdo para adicionar uma imagem a esta etapa."
                        : "O docente ainda não disponibilizou uma imagem para esta etapa."}
                  </span>
                </div>
              )}
            </figure>
          )}
          <AttachmentList
            key={`att-${step?.id || stepIndex}`}
            title="Arquivos da etapa"
            attachments={step?.attachments ?? []}
          />
          {step?.quiz &&
            (isTeacher || !isStepCompleted(stepIndex, completedStepCount)) && (
              <StepQuizPanel
                key={`quiz-${module.id}-${step.id || stepIndex}`}
                quiz={step.quiz}
                mode={isTeacher ? "teacher" : "student"}
                passed={quiz.passed}
                locked={!timer.running}
                pending={quiz.pending}
                onAnswer={quiz.onAnswer}
              />
            )}
          <div
            className="reader-carousel-controls"
            role="group"
            aria-label="Navegação do passo a passo"
          >
            <button
              type="button"
              className="reader-carousel-previous"
              disabled={stepIndex === 0}
              onClick={() => onStepChange(Math.max(0, stepIndex - 1))}
            >
              <ArrowLeft size={15} aria-hidden="true" />
              <span>Anterior</span>
            </button>
            {!isTeacher ? (
              <div
                className={`step-timer-widget ${timer.running ? "is-running" : timer.completed ? "is-complete" : "is-pending"}`}
                role="group"
                aria-label={`Timer da etapa ${stepIndex + 1}`}
              >
                <StepTimerReadout
                  session={timer.session}
                  timerKey={`${module.id}:${stepIndex}`}
                  running={timer.running}
                  completed={timer.completed}
                  label={
                    <span className="step-timer-label">
                      <strong>TEMPO DESTA ETAPA</strong>
                      <small>
                        {timer.completed
                          ? "Concluída"
                          : timer.running
                            ? "Em andamento"
                            : startPending
                              ? "Iniciando…"
                              : "Pronta para iniciar"}
                      </small>
                    </span>
                  }
                />
              </div>
            ) : (
              <span className="reader-carousel-position" role="status">
                {stepCount
                  ? `Etapa ${stepIndex + 1} de ${stepCount}`
                  : "Sem etapas"}
              </span>
            )}
            {isTeacher ? (
              <span className="reader-teacher-preview-note" role="status">
                Pré-visualização docente · progresso não é alterado
              </span>
            ) : timer.completed && canGoNext ? (
              <button
                type="button"
                className="continue-button reader-action-button is-next"
                onClick={() => onStepChange(stepIndex + 1)}
              >
                <span>Próxima etapa</span>
                <ArrowRight size={15} aria-hidden="true" />
              </button>
            ) : timer.completed ? (
              <button
                type="button"
                className="continue-button reader-action-button is-complete"
                disabled
              >
                {completedStepCount >= stepCount
                  ? "Módulo concluído"
                  : "Etapa concluída"}{" "}
                <Check size={15} aria-hidden="true" />
              </button>
            ) : (
              <button
                type="button"
                className={`continue-button reader-action-button ${timer.running ? "is-running" : "is-ready"}`}
                aria-busy={busy}
                onClick={timer.running ? onComplete : onStart}
                disabled={
                  !stepCount ||
                  !module.id ||
                  stepIndex >= stepCount ||
                  timer.completed ||
                  busy
                }
              >
                {busy ? (
                  <>
                    <LoaderCircle
                      className="reader-action-spinner"
                      size={15}
                      aria-hidden="true"
                    />
                    <span>
                      {startPending
                        ? "Iniciando etapa…"
                        : "Salvando conclusão…"}
                    </span>
                  </>
                ) : (
                  <>
                    <span>
                      {timer.running
                        ? stepIndex < stepCount - 1
                          ? "Concluir etapa"
                          : "Concluir módulo"
                        : "Iniciar etapa"}
                    </span>
                    <ArrowRight size={15} aria-hidden="true" />
                  </>
                )}
              </button>
            )}
          </div>
        </section>
      </div>
      <ResourcePanel
        key={module.id}
        resources={module.resources}
        showInventory={isTeacher}
      />
    </main>
  );
}

/** Recursos do módulo com filtro por categoria; o filtro volta a "Todos" ao trocar de módulo. */
function ResourcePanel({
  resources,
  showInventory,
}: {
  resources: Resource[];
  showInventory: boolean;
}) {
  const [category, setCategory] = useState<Category>("all");
  const filtered = filterResources(resources, category);
  const counts = countResourcesByCategory(resources);
  return (
    <section
      className="resource-panel rd-resources"
      aria-label="Recursos do módulo"
    >
      <div className="panel-heading">
        <div>
          <h2>Recursos do módulo</h2>
          <p>Materiais, máquinas e ferramentas deste conteúdo.</p>
        </div>
      </div>
      <div
        className="category-tabs"
        role="group"
        aria-label="Filtrar recursos por categoria"
      >
        {RESOURCE_CATEGORY_OPTIONS.map(item => {
          const count = counts[item.id];
          return (
            <button
              type="button"
              className={category === item.id ? "selected" : ""}
              key={item.id}
              aria-pressed={category === item.id}
              aria-label={`${item.label}: ${count} ${count === 1 ? "recurso" : "recursos"}`}
              onClick={() => setCategory(item.id)}
            >
              <span>{item.label}</span>
              <span className="category-tab-count" aria-hidden="true">
                {count}
              </span>
            </button>
          );
        })}
      </div>
      <div className="resource-list">
        {filtered.map(resource => {
          const Icon = resource.icon;
          return (
            <article
              key={resource.id}
              className="clean-card resource-card-light"
            >
              <div className="resource-card-head">
                <div className="resource-icon">
                  <Icon size={15} aria-hidden="true" />
                </div>
                <div className="resource-copy">
                  <span className="eyebrow">{resource.label}</span>
                  <strong>{resource.title}</strong>
                  <small>{resource.detail}</small>
                </div>
              </div>
              {showInventory && resource.inventory && (
                <div
                  className={`resource-stock-line health-${resource.inventory.health}`}
                  title={`Código ${resource.inventory.code} · ${resource.inventory.location}`}
                >
                  <Warehouse size={13} aria-hidden="true" />
                  <span>
                    {resource.inventory.archived
                      ? "Item arquivado no estoque"
                      : `${resource.inventory.available} ${resource.inventory.unit} disponíveis`}
                  </span>
                  <b>{STOCK_HEALTH_LABELS[resource.inventory.health]}</b>
                </div>
              )}
              <AttachmentList
                title="Arquivos"
                attachments={resource.attachments ?? []}
              />
              <div className="resource-card-foot">
                <span className="resource-stage-badge">{resource.status}</span>
                {resource.modelUrl && (
                  <a
                    className="resource-model-link"
                    href={resource.modelUrl}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Abrir referência técnica de ${resource.title} (abre em nova aba)`}
                  >
                    Abrir referência{" "}
                    <ExternalLink size={12} aria-hidden="true" />
                  </a>
                )}
              </div>
            </article>
          );
        })}
        {filtered.length === 0 && (
          <div className="empty-resources" role="status" aria-live="polite">
            <Box size={19} aria-hidden="true" />
            <div>
              <strong>
                {category === "all"
                  ? "Nenhum recurso vinculado"
                  : "Nenhum recurso nesta categoria"}
              </strong>
              <span>
                {category === "all"
                  ? "Este módulo ainda não tem recursos adicionados."
                  : "Tente outra categoria ou veja todos os recursos deste módulo."}
              </span>
            </div>
            {category !== "all" && (
              <button type="button" onClick={() => setCategory("all")}>
                Ver todos os recursos <ArrowRight size={13} />
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
