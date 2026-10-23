import { AlertTriangle, RotateCcw } from "lucide-react";
import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/** Evita tela em branco: mostra uma mensagem clara e permite recarregar. */
class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error) {
    console.error("[ControlLab] Erro de interface:", error);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="fatal-error" role="alert">
        <div className="fatal-error-card">
          <AlertTriangle size={30} aria-hidden="true" />
          <h1>Algo saiu do esperado</h1>
          <p>A interface encontrou um erro inesperado. Nenhuma alteração pendente foi enviada ao servidor. Recarregue a página para continuar.</p>
          {import.meta.env.DEV && this.state.error?.stack && <pre>{this.state.error.stack}</pre>}
          <button type="button" className="fl-button fl-button-primary" onClick={() => window.location.reload()}>
            <RotateCcw size={15} aria-hidden="true" /> Recarregar
          </button>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
