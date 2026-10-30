/**
 * Mini-quiz de verificação ao fim de uma etapa.
 *
 * O docente escreve uma pergunta de múltipla escolha (2 a 4 alternativas) por
 * etapa; o aluno só conclui a etapa depois de acertá-la. A alternativa correta
 * e a explicação ficam no servidor: o aluno recebe apenas pergunta e opções.
 */

export const QUIZ_MIN_OPTIONS = 2;
export const QUIZ_MAX_OPTIONS = 4;
export const QUIZ_QUESTION_MAX = 300;
export const QUIZ_OPTION_MAX = 200;
export const QUIZ_EXPLANATION_MAX = 600;
/** XP extra por pergunta acertada na primeira tentativa. */
export const QUIZ_FIRST_TRY_XP = 10;

export type StepQuiz = {
  question: string;
  options: string[];
  correctIndex: number;
  /** Mostrada ao aluno depois do acerto (por que esta é a resposta certa). */
  explanation: string;
};

/** O que o aluno recebe: sem gabarito nem explicação. */
export type PublicStepQuiz = { question: string; options: string[] };

/** Mensagem do primeiro problema do quiz, ou null quando ele é válido. */
export function quizProblem(quiz: StepQuiz): string | null {
  if (!quiz.question.trim()) return "Escreva a pergunta da verificação.";
  if (quiz.question.length > QUIZ_QUESTION_MAX) return `A pergunta pode ter até ${QUIZ_QUESTION_MAX} caracteres.`;
  if (quiz.options.length < QUIZ_MIN_OPTIONS || quiz.options.length > QUIZ_MAX_OPTIONS) {
    return `A verificação precisa de ${QUIZ_MIN_OPTIONS} a ${QUIZ_MAX_OPTIONS} alternativas.`;
  }
  if (quiz.options.some((option) => !option.trim())) return "Preencha todas as alternativas (ou remova as vazias).";
  if (quiz.options.some((option) => option.length > QUIZ_OPTION_MAX)) return `Cada alternativa pode ter até ${QUIZ_OPTION_MAX} caracteres.`;
  const normalized = quiz.options.map((option) => option.trim().toLocaleLowerCase("pt-BR"));
  if (new Set(normalized).size !== normalized.length) return "As alternativas precisam ser diferentes entre si.";
  if (!Number.isInteger(quiz.correctIndex) || quiz.correctIndex < 0 || quiz.correctIndex >= quiz.options.length) {
    return "Marque qual alternativa é a correta.";
  }
  if (quiz.explanation.length > QUIZ_EXPLANATION_MAX) return `A explicação pode ter até ${QUIZ_EXPLANATION_MAX} caracteres.`;
  return null;
}

/** Lê o JSON gravado em `learning_steps.quiz`; qualquer coisa inválida vira "sem quiz". */
export function parseStoredQuiz(raw: string | null | undefined): StepQuiz | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<StepQuiz> | null;
    if (!value || typeof value !== "object" || typeof value.question !== "string" || !Array.isArray(value.options)) return null;
    // Descartar só a alternativa inválida deslocaria o gabarito para outra opção: o quiz inteiro é recusado.
    if (!value.options.every((option): option is string => typeof option === "string")) return null;
    const quiz: StepQuiz = {
      question: value.question,
      options: value.options,
      correctIndex: Number(value.correctIndex),
      explanation: typeof value.explanation === "string" ? value.explanation : "",
    };
    return quizProblem(quiz) ? null : quiz;
  } catch {
    return null;
  }
}

export function serializeQuiz(quiz: StepQuiz | null | undefined): string | null {
  if (!quiz) return null;
  return JSON.stringify({
    question: quiz.question.trim(),
    options: quiz.options.map((option) => option.trim()),
    correctIndex: quiz.correctIndex,
    explanation: quiz.explanation.trim(),
  });
}

export function toPublicQuiz(quiz: StepQuiz | null): PublicStepQuiz | null {
  return quiz ? { question: quiz.question, options: quiz.options } : null;
}

export type QuizAttemptRow = { userId: number; stepId: string; correct: boolean; createdAt: Date };

/**
 * Resumo das tentativas por etapa: quantos alunos responderam, quantos
 * acertaram de primeira e a média de tentativas até o acerto.
 */
export function summarizeQuizAttempts(attempts: QuizAttemptRow[]) {
  const byStudentStep = new Map<string, QuizAttemptRow[]>();
  for (const attempt of attempts) {
    const key = `${attempt.userId}:${attempt.stepId}`;
    const list = byStudentStep.get(key) ?? [];
    list.push(attempt);
    byStudentStep.set(key, list);
  }
  const byStep = new Map<string, { answered: number; firstTry: number; solved: number; attemptsUntilSolved: number }>();
  const byStudent = new Map<number, { answered: number; firstTry: number }>();
  byStudentStep.forEach((list) => {
    list.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const { userId, stepId } = list[0];
    const firstTry = list[0].correct;
    const solvedAt = list.findIndex((attempt) => attempt.correct);
    const step = byStep.get(stepId) ?? { answered: 0, firstTry: 0, solved: 0, attemptsUntilSolved: 0 };
    step.answered += 1;
    if (firstTry) step.firstTry += 1;
    if (solvedAt >= 0) {
      step.solved += 1;
      step.attemptsUntilSolved += solvedAt + 1;
    }
    byStep.set(stepId, step);
    const student = byStudent.get(userId) ?? { answered: 0, firstTry: 0 };
    student.answered += 1;
    if (firstTry) student.firstTry += 1;
    byStudent.set(userId, student);
  });
  return { byStep, byStudent };
}
