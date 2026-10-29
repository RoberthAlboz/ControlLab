import { CircleHelp, Plus, Trash2, X } from "lucide-react";
import { QUIZ_EXPLANATION_MAX, QUIZ_MAX_OPTIONS, QUIZ_MIN_OPTIONS, QUIZ_OPTION_MAX, QUIZ_QUESTION_MAX, type StepQuiz } from "@shared/quiz";

const EMPTY_QUIZ: StepQuiz = { question: "", options: ["", ""], correctIndex: 0, explanation: "" };

/** Editor da verificação (mini-quiz) de uma etapa: pergunta, 2–4 alternativas e o gabarito. */
export default function StepQuizEditor({
  stepNumber,
  quiz,
  onChange,
}: {
  stepNumber: number;
  quiz: StepQuiz | null | undefined;
  onChange: (quiz: StepQuiz | null) => void;
}) {
  if (!quiz) {
    return (
      <button type="button" className="quiz-editor-add" onClick={() => onChange({ ...EMPTY_QUIZ, options: [...EMPTY_QUIZ.options] })}>
        <CircleHelp size={15} aria-hidden="true" /> Adicionar verificação (quiz)
      </button>
    );
  }

  const setOption = (index: number, value: string) =>
    onChange({ ...quiz, options: quiz.options.map((option, i) => (i === index ? value : option)) });
  const removeOption = (index: number) => {
    const options = quiz.options.filter((_, i) => i !== index);
    const correctIndex = quiz.correctIndex === index ? 0 : quiz.correctIndex > index ? quiz.correctIndex - 1 : quiz.correctIndex;
    onChange({ ...quiz, options, correctIndex });
  };

  return (
    <fieldset className="quiz-editor">
      <legend>
        <CircleHelp size={15} aria-hidden="true" /> Verificação da etapa {stepNumber}
      </legend>
      <p className="quiz-editor-hint">O aluno só conclui a etapa depois de acertar. Marque a alternativa correta.</p>
      <textarea
        className="me-input"
        aria-label={`Pergunta da verificação da etapa ${stepNumber}`}
        placeholder="Ex.: Qual regra de segurança vale com o torno ligado?"
        maxLength={QUIZ_QUESTION_MAX}
        value={quiz.question}
        onChange={e => onChange({ ...quiz, question: e.target.value })}
      />
      <ol className="quiz-editor-options">
        {quiz.options.map((option, index) => (
          <li key={index} className={index === quiz.correctIndex ? "is-correct" : undefined}>
            <label className="quiz-editor-correct">
              <input
                type="radio"
                name={`quiz-correct-${stepNumber}`}
                checked={index === quiz.correctIndex}
                onChange={() => onChange({ ...quiz, correctIndex: index })}
              />
              <span className="sr-only">Alternativa {index + 1} é a correta</span>
            </label>
            <input
              className="me-input"
              aria-label={`Alternativa ${index + 1} da etapa ${stepNumber}`}
              placeholder={`Alternativa ${index + 1}`}
              maxLength={QUIZ_OPTION_MAX}
              value={option}
              onChange={e => setOption(index, e.target.value)}
            />
            {quiz.options.length > QUIZ_MIN_OPTIONS && (
              <button type="button" className="me-icon-btn" onClick={() => removeOption(index)} aria-label={`Remover alternativa ${index + 1}`}>
                <X size={15} />
              </button>
            )}
          </li>
        ))}
      </ol>
      {quiz.options.length < QUIZ_MAX_OPTIONS && (
        <button type="button" className="me-link quiz-editor-more" onClick={() => onChange({ ...quiz, options: [...quiz.options, ""] })}>
          <Plus size={14} aria-hidden="true" /> Adicionar alternativa
        </button>
      )}
      <input
        className="me-input"
        aria-label={`Explicação da resposta da etapa ${stepNumber}`}
        placeholder="Explicação mostrada depois do acerto (opcional)"
        maxLength={QUIZ_EXPLANATION_MAX}
        value={quiz.explanation}
        onChange={e => onChange({ ...quiz, explanation: e.target.value })}
      />
      <button type="button" className="me-link quiz-editor-remove" onClick={() => onChange(null)}>
        <Trash2 size={14} aria-hidden="true" /> Remover verificação
      </button>
    </fieldset>
  );
}
