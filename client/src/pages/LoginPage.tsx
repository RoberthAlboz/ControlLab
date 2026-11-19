import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useLocation, useSearch } from "wouter";
import { ArrowRight, Eye, EyeOff, LoaderCircle, LockKeyhole } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useTheme } from "@/contexts/ThemeContext";
import { safeRedirectPath } from "@shared/roles";
import BootScreen from "@/components/forge/BootScreen";
import AuthCharacters, { type AuthMood } from "@/components/forge/AuthCharacters";
import BrandLogo from "@/components/forge/BrandLogo";
import ThemeSunMoon from "@/components/forge/ThemeSunMoon";
import DevAccessDialog from "@/components/forge/DevAccessDialog";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type FieldErrors = { email?: string; password?: string };

function validate(email: string, password: string): FieldErrors {
  const errors: FieldErrors = {};
  if (!email.trim()) errors.email = "Informe o seu e-mail.";
  else if (!EMAIL_PATTERN.test(email.trim())) errors.email = "Use um e-mail no formato nome@dominio.";
  if (!password) errors.password = "Informe a sua senha.";
  return errors;
}

const LOCK_PAUSE_MS = 480;

export default function LoginPage() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const next = new URLSearchParams(search).get("next");
  const { theme, toggleTheme } = useTheme();
  const utils = trpc.useUtils();
  const meQuery = trpc.auth.me.useQuery(undefined, { retry: false });
  const infoQuery = trpc.system.info.useQuery(undefined, { retry: false, staleTime: Infinity });
  const loginMutation = trpc.auth.login.useMutation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [capsLock, setCapsLock] = useState(false);
  const [failures, setFailures] = useState(0);
  const [locked, setLocked] = useState(false);
  const [devAccessOpen, setDevAccessOpen] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const emailId = useId();
  const passwordId = useId();
  const errorId = useId();

  // Quem já tem sessão válida não precisa ver o formulário.
  useEffect(() => {
    if (meQuery.data) navigate(safeRedirectPath(next, meQuery.data.role), { replace: true });
  }, [meQuery.data, navigate, next]);

  useEffect(() => {
    if (!meQuery.isLoading && !meQuery.data) emailRef.current?.focus();
  }, [meQuery.isLoading, meQuery.data]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loginMutation.isPending || locked) return;
    const found = validate(email, password);
    setErrors(found);
    setFormError(null);
    if (found.email) return emailRef.current?.focus();
    if (found.password) return passwordRef.current?.focus();
    signIn(email.trim(), password);
  };

  const signIn = (loginEmail: string, loginPassword: string) => {
    loginMutation.mutate(
      { email: loginEmail, password: loginPassword },
      {
        onSuccess: async ({ user }) => {
          // Deixa o trem de engrenagens travar antes da troca de tela. Gravar a
          // sessão no cache já troca a tela, então a pausa vem antes.
          setLocked(true);
          if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
            await new Promise(resolve => setTimeout(resolve, LOCK_PAUSE_MS));
          }
          utils.auth.me.setData(undefined, user);
          await utils.invalidate();
          navigate(safeRedirectPath(next, user.role), { replace: true });
        },
        onError: error => {
          // Mantém o e-mail digitado; limpa só a senha.
          setPassword("");
          setFailures(count => count + 1);
          setFormError(error.message || "Não foi possível entrar. Tente novamente.");
          setDevAccessOpen(false);
          passwordRef.current?.focus();
        },
      },
    );
  };

  if (meQuery.isLoading || meQuery.data) {
    return <BootScreen label="Verificando sessão…" onRetry={() => void meQuery.refetch()} />;
  }

  const isDevelopment = infoQuery.data?.environment === "development";
  // A cena reage ao formulário: triste com erro, de olhos fechados ao digitar a senha, feliz ao entrar.
  const hasError = Boolean(formError || errors.email || errors.password);
  const mood: AuthMood = locked ? "happy" : hasError ? "sad" : passwordFocused && !showPassword ? "hiding" : "idle";

  return (
    <div className="auth-screen">
      <div className="auth-card">
      <section className="auth-stage" aria-hidden="true">
        <AuthCharacters mood={mood} />
      </section>

      <main className="auth-form-panel">
        <div className="auth-form-top">
          {isDevelopment && (
            <button
              type="button"
              className="dev-badge is-button"
              title="Ambiente de desenvolvimento: ver contas de teste"
              aria-haspopup="dialog"
              onClick={() => setDevAccessOpen(true)}
            >
              DEV
            </button>
          )}
          <button
            type="button"
            className="auth-theme-toggle"
            onClick={() => toggleTheme?.()}
            aria-label={theme === "dark" ? "Ativar modo claro" : "Ativar modo escuro"}
          >
            <ThemeSunMoon dark={theme === "dark"} size={19} />
          </button>
        </div>

        <div className="auth-form-wrap">
          <BrandLogo withMark className="auth-logo" />
          <h1>Bem-vindo de volta!</h1>
          <p className="auth-lead">Use o e-mail e a senha cadastrados pela escola.</p>

          <form className="auth-form" onSubmit={submit} noValidate aria-describedby={formError ? errorId : undefined}>
            {formError && (
              <div className="auth-alert" role="alert" id={errorId}>
                <LockKeyhole size={16} aria-hidden="true" />
                <span>{formError}</span>
              </div>
            )}

            <div className={`fl-field ${errors.email ? "has-error" : ""}`}>
              <label htmlFor={emailId}>E-mail</label>
              <input
                ref={emailRef}
                id={emailId}
                type="email"
                inputMode="email"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                value={email}
                onChange={event => {
                  setEmail(event.target.value);
                  if (errors.email) setErrors(current => ({ ...current, email: undefined }));
                }}
                aria-invalid={Boolean(errors.email)}
                aria-describedby={errors.email ? `${emailId}-error` : undefined}
                disabled={loginMutation.isPending}
                placeholder="nome@escola.br"
              />
              {errors.email && (
                <small id={`${emailId}-error`} className="fl-field-error">
                  {errors.email}
                </small>
              )}
            </div>

            <div className={`fl-field ${errors.password ? "has-error" : ""}`}>
              <label htmlFor={passwordId}>Senha</label>
              <div className="fl-password">
                <input
                  ref={passwordRef}
                  id={passwordId}
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={event => {
                    setPassword(event.target.value);
                    if (errors.password) setErrors(current => ({ ...current, password: undefined }));
                  }}
                  onKeyUp={event => setCapsLock(event.getModifierState?.("CapsLock") ?? false)}
                  onFocus={() => setPasswordFocused(true)}
                  onBlur={() => setPasswordFocused(false)}
                  aria-invalid={Boolean(errors.password)}
                  aria-describedby={[errors.password ? `${passwordId}-error` : "", capsLock ? `${passwordId}-caps` : ""].filter(Boolean).join(" ") || undefined}
                  disabled={loginMutation.isPending}
                />
                <button
                  type="button"
                  className="fl-password-toggle"
                  onClick={() => setShowPassword(value => !value)}
                  aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  aria-pressed={showPassword}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {errors.password && (
                <small id={`${passwordId}-error`} className="fl-field-error">
                  {errors.password}
                </small>
              )}
              {capsLock && (
                <small id={`${passwordId}-caps`} className="fl-field-hint">
                  Caps Lock está ativado.
                </small>
              )}
            </div>

            <button type="submit" className="fl-button fl-button-primary auth-submit" disabled={loginMutation.isPending} aria-busy={loginMutation.isPending}>
              {loginMutation.isPending ? (
                <>
                  <LoaderCircle size={16} className="fl-spin" aria-hidden="true" /> Entrando…
                </>
              ) : (
                <>
                  Entrar <ArrowRight size={16} aria-hidden="true" />
                </>
              )}
            </button>
          </form>

          <p className="auth-footnote">
            Esqueceu a senha? Procure a coordenação do curso para redefini-la.
            {isDevelopment && (
              <>
                <br />
                <span className="auth-dev-note">Ambiente de desenvolvimento: clique no selo <b>DEV</b> para ver as contas de teste e entrar com um clique.</span>
              </>
            )}
          </p>
        </div>
      </main>
      </div>

      {isDevelopment && (
        <DevAccessDialog
          open={devAccessOpen}
          onOpenChange={setDevAccessOpen}
          busy={loginMutation.isPending}
          onUse={(accountEmail, accountPassword) => {
            setEmail(accountEmail);
            setPassword(accountPassword);
            setErrors({});
            setFormError(null);
            signIn(accountEmail, accountPassword);
          }}
        />
      )}
    </div>
  );
}
