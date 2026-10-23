import { ArrowLeft, LockKeyhole } from "lucide-react";

type AccessDeniedProps = {
  title?: string;
  description?: string;
  onBack: () => void;
  backLabel?: string;
};

/** Exibida quando alguém sem permissão abre uma rota restrita pela URL. */
export default function AccessDenied({
  title = "Acesso restrito a docentes",
  description = "Esta área é exclusiva do modo docente. Se você precisa de um material da ferramentaria, fale com o seu professor.",
  onBack,
  backLabel = "Voltar ao início",
}: AccessDeniedProps) {
  return (
    <main className="clean-content access-denied" role="alert" aria-labelledby="access-denied-title">
      <div className="access-denied-card">
        <span className="access-denied-icon" aria-hidden="true">
          <LockKeyhole size={22} />
        </span>
        <span className="eyebrow">ERRO 403 · PERMISSÃO</span>
        <h1 id="access-denied-title">{title}</h1>
        <p>{description}</p>
        <button type="button" className="fl-button fl-button-primary" onClick={onBack}>
          <ArrowLeft size={15} aria-hidden="true" /> {backLabel}
        </button>
      </div>
    </main>
  );
}
