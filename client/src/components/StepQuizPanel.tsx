import { useState } from "react";
import { Check, CircleHelp, LoaderCircle, RotateCcw, X } from "lucide-react";

type QuizView = { question: string; options: string[]; correctIndex?: number; explanation?: string };
type Feedback = { correct: boolean; explanation: string };

/**
 * Verificação ao fim da etapa, no leitor.
 * - Aluno: escolhe e confere; no erro tenta de novo (sem ver o gabarito); no acerto vê a explicação.
 * - Docente: pré-visualização com a alternativa correta destacada.
 * Montado com `key` da etapa para recomeçar limpo a cada etapa.
 */
export default function StepQuizPanel({
  quiz,
  mode,
  passed,
  locked,
  pending,
  onAnswer,
}: {
  quiz: QuizView;
  mode: "student" | "teacher";
  /** O servidor já registrou o acerto desta etapa. */
  passed: boolean;
  /** Etapa ainda não iniciada (ou já concluída): não aceita resposta. */
  locked: boolean;
  pending: boolean;
  onAnswer: (selectedIndex: number) => Promise<Feedback | null>;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const isTeacher = mode === "teacher";
  const solved = passed || feedback?.correct === true;

  const submit = async () => {
    if (selected === null || pending || solved || locked) return;
    const result = await onAnswer(selected);
    if (result) setFeedback(result);
  };

  return (
    <section className={`step-quiz ${solved ? "is-solved" : ""}`} aria-labelledby="step-quiz-title">
      <header className="step-quiz-head">
        <span className="step-quiz-icon" aria-hidden="true">
          {solved ? <Check size={16} /> : <CircleHelp size={16} />}
        </span>
        <div>
          <small id="step-quiz-title">VERIFICAÇÃO DA ETAPA</small>
          <strong>{quiz.question}</strong>
        </div>
      </header>
      <div className="step-quiz-options" role="radiogroup" aria-label="Alternativas">
        {quiz.options.map((option, index) => {
          const isCorrectPreview = isTeacher && index === quiz.correctIndex;
          const isChosen = selected === index;
          const state = isCorrectPreview
            ? "is-correct"
            : isChosen && feedback
              ? feedback.correct
                ? "is-correct"
                : "is-wrong"
              : isChosen
                ? "is-selected"
                : "";
          return (
            <button
              key={index}
              type="button"
              role="radio"
              aria-checked={isChosen || isCorrectPreview}
              className={`step-quiz-option ${state}`}
              disabled={isTeacher || solved || locked || pending}
              onClick={() => {
                setSelected(index);
                if (feedback && !feedback.correct) setFeedback(null);
              }}
            >
              <span className="step-quiz-letter" aria-hidden="true">
                {String.fromCharCode(65 + index)}
              </span>
              <span>{option}</span>
            </button>
          );
        })}
      </div>
      <div className="step-quiz-footer" role="status" aria-live="polite">
        {isTeacher ? (
          <p>Pré-visualização: o aluno precisa acertar para concluir a etapa.{quiz.explanation ? ` Explicação: ${quiz.explanation}` : ""}</p>
        ) : solved ? (
          <p className="step-quiz-ok">
            <Check size={15} aria-hidden="true" /> Resposta correta.{feedback?.explanation ? ` ${feedback.explanation}` : ""} Agora você pode concluir a etapa.
          </p>
        ) : feedback && !feedback.correct ? (
          <p className="step-quiz-wrong">
            <X size={15} aria-hidden="true" /> Ainda não. Releia a etapa e escolha outra alternativa.
          </p>
        ) : locked ? (
          <p>Inicie a etapa para responder.</p>
        ) : (
          <p>Escolha uma alternativa e confira para liberar a conclusão.</p>
        )}
        {!isTeacher && !solved && (
          <button type="button" className="step-quiz-submit" onClick={() => void submit()} disabled={selected === null || locked || pending}>
            {pending ? (
              <LoaderCircle className="reader-action-spinner" size={15} aria-hidden="true" />
            ) : feedback && !feedback.correct ? (
              <RotateCcw size={15} aria-hidden="true" />
            ) : (
              <Check size={15} aria-hidden="true" />
            )}
            Conferir resposta
          </button>
        )}
      </div>
    </section>
  );
}
