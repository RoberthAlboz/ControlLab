import { useState } from "react";
import { Award, Plus, Trash2 } from "lucide-react";
import type {
  AssignedStudentBadge,
  BadgeStudent,
  AwardStudentBadgeInput,
} from "@shared/competencies";

const STRENGTH_SUGGESTIONS = [
  "Metrologia de precisão",
  "Segurança no laboratório",
  "Organização da bancada",
  "Leitura de desenho técnico",
  "Trabalho em equipe",
];

type TeacherBadgeManagerProps = {
  students: BadgeStudent[];
  badges: AssignedStudentBadge[];
  loading: boolean;
  error?: boolean;
  saving: boolean;
  onAssign: (input: AwardStudentBadgeInput) => void;
  onRemove: (badgeId: number) => void;
  onRetry?: () => void;
};

export default function TeacherBadgeManager({
  students,
  badges,
  loading,
  error = false,
  saving,
  onAssign,
  onRemove,
  onRetry,
}: TeacherBadgeManagerProps) {
  const [studentId, setStudentId] = useState<number | "">("");
  const [label, setLabel] = useState("");
  const [detail, setDetail] = useState("");
  const selectedStudentId = students.some(student => student.id === studentId)
    ? studentId
    : (students[0]?.id ?? "");

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (typeof selectedStudentId !== "number" || !label.trim()) return;
    onAssign({ studentId: selectedStudentId, label, detail });
    setLabel("");
    setDetail("");
  };

  return (
    <section className="teacher-badge-manager" aria-labelledby="teacher-badge-title">
      <div className="teacher-badge-manager-heading">
        <div>
          <span className="eyebrow">RECONHECIMENTO DOCENTE</span>
          <h2 id="teacher-badge-title">Pontos fortes dos alunos</h2>
          <p>Registre em que cada aluno se destaca.</p>
        </div>
        <span className="teacher-badge-total" aria-label={`${badges.length} pontos fortes registrados`}>
          <strong>{badges.length}</strong> {badges.length === 1 ? "registrado" : "registrados"}
        </span>
      </div>

      <form className="teacher-badge-form" onSubmit={submit}>
        <label className="teacher-badge-field">
          <span className="teacher-badge-label">Aluno</span>
          <select
            value={selectedStudentId}
            onChange={event => setStudentId(event.target.value ? Number(event.target.value) : "")}
            disabled={loading || saving || students.length === 0}
            required
          >
            {students.length === 0 ? <option value="">Nenhum aluno disponível</option> : students.map(student => (
              <option key={student.id} value={student.id}>{student.name || `Aluno ${student.id}`}</option>
            ))}
          </select>
        </label>
        <label className="teacher-badge-field">
          <span className="teacher-badge-label">O que o aluno faz bem?</span>
          <input
            value={label}
            onChange={event => setLabel(event.target.value)}
            placeholder="Ex.: metrologia de precisão"
            maxLength={100}
            required
          />
        </label>
        <div className="teacher-badge-suggestions" role="group" aria-label="Sugestões de ponto forte">
          {STRENGTH_SUGGESTIONS.map(suggestion => (
            <button
              key={suggestion}
              type="button"
              className={label.trim().toLowerCase() === suggestion.toLowerCase() ? "is-active" : undefined}
              aria-pressed={label.trim().toLowerCase() === suggestion.toLowerCase()}
              onClick={() => setLabel(suggestion)}
              disabled={loading || saving}
            >
              {suggestion}
            </button>
          ))}
        </div>
        <label className="teacher-badge-field teacher-badge-detail-field">
          <span className="teacher-badge-label">
            Observação do docente <em>opcional</em>
            <small aria-hidden="true">{detail.length}/500</small>
          </span>
          <textarea
            value={detail}
            onChange={event => setDetail(event.target.value)}
            placeholder="Ex.: realiza medições cuidadosas com o micrômetro."
            maxLength={500}
            rows={2}
          />
        </label>
        <div className="teacher-badge-form-footer">
          <p className="teacher-badge-preview" aria-live="polite">
            <Award size={14} aria-hidden="true" />
            {label.trim() ? <>Aparecerá como <strong>Bom em {label.trim()}</strong></> : "Escolha uma sugestão ou descreva a habilidade observada."}
          </p>
          <button className="new-module-button teacher-badge-submit" type="submit" disabled={loading || saving || students.length === 0 || !label.trim()}>
            <Plus size={14} aria-hidden="true" /> {saving ? "Salvando..." : "Registrar ponto forte"}
          </button>
        </div>
      </form>

      <div className="teacher-badge-list" aria-live="polite">
        {loading ? <p className="teacher-badge-empty">Carregando badges e alunos...</p> : error ? (
          <p className="teacher-badge-empty" role="alert">Não foi possível carregar os pontos fortes do banco. <button type="button" onClick={onRetry}>Tentar novamente</button></p>
        ) : badges.length === 0 ? (
          <div className="teacher-badge-empty teacher-badge-empty-state">
            <Award size={20} aria-hidden="true" />
            <div>
              <strong>Nenhum ponto forte registrado ainda</strong>
              <span>Quando notar um aluno se destacando, registre aqui. Os reconhecimentos aparecem nesta lista.</span>
            </div>
          </div>
        ) : badges.map(badge => (
          <article className="teacher-badge-row" key={badge.id}>
            <Award size={16} aria-hidden="true" />
            <div>
              <strong>Bom em {badge.label}</strong>
              <span>{badge.studentName || `Aluno ${badge.userId}`}{badge.detail ? ` · ${badge.detail}` : ""}</span>
              <small>Atribuída em {new Date(badge.awardedAt).toLocaleDateString("pt-BR")}</small>
            </div>
            <button type="button" aria-label={`Remover ponto forte “Bom em ${badge.label}” de ${badge.studentName || "aluno"}`} title="Remover ponto forte" disabled={saving} onClick={() => {
              if (window.confirm(`Remover a badge “${badge.label}” de ${badge.studentName || "este aluno"}?`)) onRemove(badge.id);
            }}>
              <Trash2 size={14} aria-hidden="true" />
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
