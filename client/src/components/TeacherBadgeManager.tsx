import { useState } from "react";
import { Award, Plus, Trash2 } from "lucide-react";
import type {
  AssignedStudentBadge,
  BadgeStudent,
  AwardStudentBadgeInput,
} from "@shared/competencies";

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
        <span className="teacher-badge-total" aria-label={`${badges.length} badges atribuídas`}>{badges.length}</span>
      </div>

      <form className="teacher-badge-form" onSubmit={submit}>
        <label>
          Aluno
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
        <label>
          O que o aluno faz bem?
          <input
            value={label}
            onChange={event => setLabel(event.target.value)}
            placeholder="Ex.: metrologia de precisão"
            maxLength={100}
            required
          />
        </label>
        <label className="teacher-badge-detail-field">
          Observação do docente <span>(opcional)</span>
          <textarea
            value={detail}
            onChange={event => setDetail(event.target.value)}
            placeholder="Ex.: realiza medições cuidadosas com o micrômetro."
            maxLength={500}
            rows={2}
          />
        </label>
        <button className="new-module-button teacher-badge-submit" type="submit" disabled={loading || saving || students.length === 0 || !label.trim()}>
          <Plus size={14} aria-hidden="true" /> {saving ? "Salvando..." : "Registrar ponto forte"}
        </button>
      </form>

      <div className="teacher-badge-list" aria-live="polite">
        {loading ? <p className="teacher-badge-empty">Carregando badges e alunos...</p> : error ? (
          <p className="teacher-badge-empty" role="alert">Não foi possível carregar os pontos fortes do banco. <button type="button" onClick={onRetry}>Tentar novamente</button></p>
        ) : badges.length === 0 ? (
          <p className="teacher-badge-empty">Nenhum ponto forte registrado. Use o formulário para reconhecer uma habilidade observada.</p>
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
