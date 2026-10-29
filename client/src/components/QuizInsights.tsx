import { useState } from "react";
import { ChevronDown, CircleHelp, TriangleAlert } from "lucide-react";

export type QuizStepInsight = {
  stepId: string;
  moduleId: string;
  moduleTitle: string;
  stepNumber: number;
  stepTitle: string;
  question: string;
  answered: number;
  firstTry: number;
  averageAttempts: number | null;
};

/** Abaixo disso a etapa aparece como "revisar": mais da metade errou na primeira tentativa. */
const REVIEW_THRESHOLD = 50;

/**
 * Onde a turma acerta de primeira e onde trava: o tempo mostra dedicação,
 * a verificação mostra se o conteúdo da etapa foi entendido.
 */
export default function QuizInsights({ steps }: { steps: QuizStepInsight[] }) {
  const [showUnanswered, setShowUnanswered] = useState(false);
  // Pior acerto primeiro: o que pede revisão fica no topo. Sem respostas, recolhido.
  const rateOf = (step: QuizStepInsight) => (step.answered ? step.firstTry / step.answered : 1);
  const answered = steps.filter(step => step.answered > 0).sort((a, b) => rateOf(a) - rateOf(b));
  const unanswered = steps.filter(step => step.answered === 0);
  const visible = showUnanswered ? [...answered, ...unanswered] : answered;
  return (
    <section className="quiz-insights" aria-labelledby="quiz-insights-title">
      <div className="teacher-section-head">
        <div>
          <span className="eyebrow">APRENDIZAGEM</span>
          <h2 id="quiz-insights-title">Verificações das etapas</h2>
          <p>Acerto de primeira por etapa. Abaixo de {REVIEW_THRESHOLD}%, vale revisar o conteúdo.</p>
        </div>
      </div>
      {!steps.length ? (
        <p className="quiz-insights-empty">
          <CircleHelp size={16} aria-hidden="true" /> Nenhuma etapa tem verificação ainda. Adicione uma pergunta no editor do módulo.
        </p>
      ) : (
        <>
        {!answered.length && !showUnanswered && (
          <p className="quiz-insights-empty">
            <CircleHelp size={16} aria-hidden="true" /> Nenhum aluno respondeu às verificações ainda.
          </p>
        )}
        <ul className="quiz-insights-list">
          {visible.map(step => {
            const rate = step.answered ? Math.round((step.firstTry / step.answered) * 100) : null;
            const needsReview = rate !== null && rate < REVIEW_THRESHOLD;
            return (
              <li key={step.stepId} className={needsReview ? "needs-review" : undefined}>
                <div className="quiz-insights-copy">
                  <small>
                    {step.moduleTitle} · Etapa {step.stepNumber}: {step.stepTitle}
                  </small>
                  <strong>{step.question}</strong>
                  {needsReview && (
                    <em>
                      <TriangleAlert size={13} aria-hidden="true" /> Revisar esta etapa
                    </em>
                  )}
                </div>
                <div className="quiz-insights-meter" aria-label={rate === null ? "Ainda sem respostas" : `${rate}% de acerto na primeira tentativa`}>
                  <b>{rate === null ? "—" : `${rate}%`}</b>
                  <i aria-hidden="true">
                    <span style={{ width: `${rate ?? 0}%` }} />
                  </i>
                  <small>
                    {step.answered
                      ? `${step.firstTry}/${step.answered} de primeira${step.averageAttempts ? ` · ${step.averageAttempts.toLocaleString("pt-BR")} tentativa(s) em média` : ""}`
                      : "Ainda sem respostas"}
                  </small>
                </div>
              </li>
            );
          })}
        </ul>
        {unanswered.length > 0 && (
          <button type="button" className="quiz-insights-more" aria-expanded={showUnanswered} onClick={() => setShowUnanswered(open => !open)}>
            {showUnanswered ? "Ocultar etapas sem respostas" : `${unanswered.length} ${unanswered.length === 1 ? "etapa ainda sem respostas" : "etapas ainda sem respostas"}`}
            <ChevronDown size={14} aria-hidden="true" className={showUnanswered ? "is-open" : undefined} />
          </button>
        )}
        </>
      )}
    </section>
  );
}
