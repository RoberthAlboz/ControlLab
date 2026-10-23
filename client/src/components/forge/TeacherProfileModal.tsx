import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BookOpen, CalendarClock, Clock3, FileText, Layers3, TrendingUp, X } from "lucide-react";

/**
 * Perfil do docente aberto a partir do painel do aluno. Mostra quem é o docente,
 * os números da formação do aluno e a próxima aula da turma (quando houver).
 * Fecha com Esc, com o X ou clicando fora; o foco vai para o modal ao abrir e
 * volta para quem o abriu ao fechar.
 */
export type TeacherProfile = {
  initials: string;
  name: string;
  role: string;
  level: string;
  avatarUrl?: string | null;
};

type TeacherProfileModalProps = {
  teacher: TeacherProfile | null;
  publishedModules: number;
  progress: number;
  studiedTime: string;
  nextClass?: { title: string; when: string } | null;
  onClose: () => void;
  onOpenLibrary: () => void;
  onOpenNotes: () => void;
};

export default function TeacherProfileModal({
  teacher,
  publishedModules,
  progress,
  studiedTime,
  nextClass,
  onClose,
  onOpenLibrary,
  onOpenNotes,
}: TeacherProfileModalProps) {
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!teacher) return;
    const opener = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      opener?.focus?.();
    };
  }, [teacher, onClose]);

  const clamped = Math.max(0, Math.min(100, Math.round(progress)));

  return (
    <AnimatePresence>
      {teacher && (
        <motion.div
          className="tp-backdrop"
          role="presentation"
          onClick={onClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          <motion.section
            ref={dialogRef}
            className="tp-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="teacher-profile-title"
            tabIndex={-1}
            onClick={event => event.stopPropagation()}
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
          >
            <button type="button" className="tp-close" onClick={onClose} aria-label="Fechar perfil">
              <X size={18} />
            </button>

            <header className="tp-head">
              <div className="tp-avatar" aria-hidden="true">
                {teacher.avatarUrl ? <img src={teacher.avatarUrl} alt="" /> : teacher.initials}
              </div>
              <div className="tp-identity">
                <p className="tp-eyebrow">Docente da sua formação</p>
                <h2 id="teacher-profile-title">{teacher.name}</h2>
                <p className="tp-role">
                  {teacher.role}
                  {teacher.level && <b className="tp-level">{teacher.level}</b>}
                </p>
              </div>
            </header>

            <dl className="tp-stats">
              <div>
                <dt>
                  <Layers3 size={15} aria-hidden="true" /> Módulos
                </dt>
                <dd>{publishedModules}</dd>
                <p>publicados no catálogo</p>
              </div>
              <div>
                <dt>
                  <TrendingUp size={15} aria-hidden="true" /> Seu progresso
                </dt>
                <dd>{clamped}%</dd>
                <div className="tp-bar" role="progressbar" aria-label="Seu progresso" aria-valuemin={0} aria-valuemax={100} aria-valuenow={clamped}>
                  <i style={{ width: `${clamped}%` }} />
                </div>
              </div>
              <div>
                <dt>
                  <Clock3 size={15} aria-hidden="true" /> Tempo de estudo
                </dt>
                <dd>{studiedTime}</dd>
                <p>cronometrado nas etapas</p>
              </div>
            </dl>

            <div className="tp-next">
              <b className="tp-next-icon" aria-hidden="true">
                <CalendarClock size={18} />
              </b>
              {nextClass ? (
                <div>
                  <p className="tp-next-label">Próxima aula da turma</p>
                  <strong>{nextClass.title}</strong>
                  <p className="tp-next-when">{nextClass.when}</p>
                </div>
              ) : (
                <div>
                  <p className="tp-next-label">Próxima aula da turma</p>
                  <strong>Nenhuma aula agendada</strong>
                  <p className="tp-next-when">Quando houver, ela aparece aqui e no seu cronograma.</p>
                </div>
              )}
            </div>

            <footer className="tp-actions">
              <button
                type="button"
                className="tp-btn"
                onClick={() => {
                  onClose();
                  onOpenLibrary();
                }}
              >
                <BookOpen size={16} aria-hidden="true" /> Ver módulos
              </button>
              <button
                type="button"
                className="tp-btn is-primary"
                onClick={() => {
                  onClose();
                  onOpenNotes();
                }}
              >
                <FileText size={16} aria-hidden="true" /> Abrir anotações
              </button>
            </footer>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
