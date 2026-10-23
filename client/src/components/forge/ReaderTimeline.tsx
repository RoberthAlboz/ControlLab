import { Check, CircleDot, LockKeyhole } from "lucide-react";

type ReaderTimelineStep = {
  id: string;
  title: string;
};

type ReaderTimelineProps = {
  steps: ReaderTimelineStep[];
  activeIndex: number;
  canVisitThrough: number;
  teacherMode: boolean;
  isRunning: boolean;
  isCompleted: (index: number) => boolean;
  onSelect: (index: number) => void;
};

export default function ReaderTimeline({
  steps,
  activeIndex,
  canVisitThrough,
  teacherMode,
  isRunning,
  isCompleted,
  onSelect,
}: ReaderTimelineProps) {
  const completedCount = steps.reduce((count, _step, index) => count + Number(isCompleted(index)), 0);

  return (
    <nav className="reader-timeline" aria-label="Etapas do módulo">
      <div className="reader-timeline-heading">
        <div>
          <span className="eyebrow">SEQUÊNCIA</span>
          <strong>Etapas do módulo</strong>
        </div>
        <span className="reader-timeline-count" aria-label={`${completedCount} de ${steps.length} etapas concluídas`}>
          {completedCount}/{steps.length}
        </span>
      </div>

      <div
        className="reader-timeline-progress"
        role="progressbar"
        aria-label="Etapas concluídas"
        aria-valuemin={0}
        aria-valuemax={steps.length}
        aria-valuenow={completedCount}
        aria-valuetext={`${completedCount} de ${steps.length} etapas concluídas`}
      >
        <span style={{ width: `${steps.length ? (completedCount / steps.length) * 100 : 0}%` }} />
      </div>

      {steps.length > 0 ? (
        <ol className="reader-timeline-list">
          {steps.map((step, index) => {
            const current = index === activeIndex;
            const completed = isCompleted(index);
            const locked = !teacherMode && index > canVisitThrough;
            const status = completed
              ? "Concluída"
              : current && isRunning
                ? "Em andamento"
                : current && teacherMode
                  ? "Prévia docente"
                  : current
                    ? "Pronta para iniciar"
                    : locked
                      ? "Bloqueada"
                      : "Pronta para iniciar";

            return (
              <li className="reader-timeline-item" key={step.id}>
                <button
                  type="button"
                  className={`reader-timeline-step${current ? " is-current" : ""}${completed ? " is-complete" : ""}${locked ? " is-locked" : ""}`}
                  aria-current={current ? "step" : undefined}
                  aria-label={`Etapa ${index + 1}: ${step.title}. ${status}${locked ? "; conclua a etapa anterior para liberar" : ""}`}
                  disabled={locked}
                  onClick={() => onSelect(index)}
                >
                  <span className="reader-timeline-marker" aria-hidden="true">
                    {completed ? <Check size={14} strokeWidth={2.5} /> : locked ? <LockKeyhole size={12} /> : current ? <CircleDot size={15} /> : String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="reader-timeline-copy">
                    <span className="reader-timeline-step-number">ETAPA {String(index + 1).padStart(2, "0")}</span>
                    <strong>{step.title}</strong>
                    <small>{status}</small>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="reader-timeline-empty">As etapas deste módulo aparecerão aqui.</p>
      )}

      <p className="reader-timeline-note">
        {teacherMode
          ? "A prévia não altera o progresso do aluno."
          : "Selecionar outra etapa não inicia o cronômetro."}
      </p>
    </nav>
  );
}
