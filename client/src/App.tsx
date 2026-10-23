import { Redirect, Route, Switch } from "wouter";
import { RotateCcw } from "lucide-react";
import ErrorBoundary from "./components/ErrorBoundary";
import GearLoader from "./components/forge/GearLoader";
import { ThemeProvider } from "./contexts/ThemeContext";
import { useAuth } from "./_core/hooks/useAuth";
import { loginUrl } from "./const";
import Home from "./pages/Home";
import LoginPage from "./pages/LoginPage";

/**
 * Toda rota além de /login exige sessão. A verificação real acontece no
 * servidor (auth.me lê o cookie httpOnly); aqui apenas decidimos o que exibir.
 */
function ProtectedApp() {
  const auth = useAuth();

  if (auth.loading) {
    return (
      <div className="auth-screen is-checking">
        <GearLoader label="Verificando sessão…" size="lg" />
      </div>
    );
  }

  if (auth.error && !auth.user) {
    return (
      <div className="fatal-error" role="alert">
        <div className="fatal-error-card">
          <h1>Servidor indisponível</h1>
          <p>Não foi possível verificar a sua sessão. Confira se o servidor e o banco de dados estão em execução.</p>
          <button type="button" className="fl-button fl-button-primary" onClick={() => void auth.refresh()}>
            <RotateCcw size={15} aria-hidden="true" /> Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  if (!auth.user) return <Redirect to={loginUrl()} replace />;

  // A chave por usuário garante que nenhum estado de outra sessão seja reaproveitado.
  return <Home key={`${auth.user.id}:${auth.user.role}`} user={auth.user} onLogout={auth.logout} loggingOut={auth.loggingOut} />;
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light" switchable>
        <Switch>
          <Route path="/login" component={LoginPage} />
          <Route>
            <ProtectedApp />
          </Route>
        </Switch>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
