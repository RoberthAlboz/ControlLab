/**
 * Peças de interface compartilhadas pela área de estoque. Seguem o mesmo
 * sistema visual do ForgeLab (forge-platform.css): papel, tinta e vermelho.
 */
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { AlertTriangle, ChevronLeft, ChevronRight, X } from "lucide-react";
import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { createRequestKey } from "@shared/inventory-schemas";
import {
  LOAN_STATUS_LABELS,
  MOVEMENT_TYPE_LABELS,
  STOCK_HEALTH_LABELS,
  type LoanStatus,
  type MovementType,
  type StockHealth,
} from "@shared/inventory";
import GearLoader from "@/components/forge/GearLoader";

const dateTime = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });
const dateOnly = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" });
const number = new Intl.NumberFormat("pt-BR");

export function formatDateTime(value: Date | string | null | undefined) {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : dateTime.format(date);
}

export function formatDate(value: Date | string | null | undefined) {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : dateOnly.format(date);
}

export function formatQuantity(value: number, unit?: string) {
  return `${number.format(value)}${unit ? ` ${unit}` : ""}`;
}

/** Chave de idempotência estável enquanto o formulário estiver aberto. */
export function useRequestKey(resetSignal: unknown) {
  const [key, setKey] = useState(() => createRequestKey());
  useEffect(() => {
    setKey(createRequestKey());
  }, [resetSignal]);
  return [key, () => setKey(createRequestKey())] as const;
}

export function useDebouncedValue<T>(value: T, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timeout = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timeout);
  }, [value, delay]);
  return debounced;
}

export function HealthChip({ health }: { health: StockHealth }) {
  return <span className={`fl-chip health-${health}`}>{STOCK_HEALTH_LABELS[health]}</span>;
}

export function LoanStatusChip({ status, overdue }: { status: LoanStatus; overdue?: boolean }) {
  if (overdue) return <span className="fl-chip health-sem_saldo">Atrasado</span>;
  return <span className={`fl-chip loan-${status}`}>{LOAN_STATUS_LABELS[status]}</span>;
}

const POSITIVE: MovementType[] = ["entrada", "ajuste_entrada", "devolucao"];
const NEGATIVE: MovementType[] = ["saida", "ajuste_saida", "retirada"];

export function MovementChip({ type }: { type: MovementType }) {
  const tone = POSITIVE.includes(type) ? "is-in" : NEGATIVE.includes(type) ? "is-out" : "is-neutral";
  return <span className={`fl-chip movement ${tone}`}>{MOVEMENT_TYPE_LABELS[type]}</span>;
}

export function movementSign(type: MovementType) {
  return POSITIVE.includes(type) ? "+" : NEGATIVE.includes(type) ? "−" : "";
}

type ModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: "md" | "lg";
  variant?: "dialog" | "sheet";
  /** Impede fechar por clique fora/ESC enquanto uma operação está em andamento. */
  busy?: boolean;
};

export function Modal({ open, onOpenChange, title, description, children, footer, size = "md", variant = "dialog", busy = false }: ModalProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={next => (!busy || next ? onOpenChange(next) : undefined)}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fl-overlay" />
        <DialogPrimitive.Content
          className={`fl-modal fl-modal-${size} ${variant === "sheet" ? "is-sheet" : ""}`}
          onEscapeKeyDown={event => busy && event.preventDefault()}
          onPointerDownOutside={event => busy && event.preventDefault()}
        >
          <header className="fl-modal-header">
            <div>
              <DialogPrimitive.Title className="fl-modal-title">{title}</DialogPrimitive.Title>
              {description ? (
                <DialogPrimitive.Description className="fl-modal-description">{description}</DialogPrimitive.Description>
              ) : (
                <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
              )}
            </div>
            <DialogPrimitive.Close className="fl-icon-button" aria-label="Fechar" disabled={busy}>
              <X size={17} />
            </DialogPrimitive.Close>
          </header>
          <div className="fl-modal-body">{children}</div>
          {footer && <footer className="fl-modal-footer">{footer}</footer>}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

type FieldProps = {
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
  className?: string;
  children: (props: { id: string; "aria-invalid": boolean; "aria-describedby"?: string }) => ReactNode;
};

/** Campo acessível: rótulo associado, erro anunciado e dica ligada ao input. */
export function Field({ label, error, hint, required, className = "", children }: FieldProps) {
  const id = useId();
  const describedBy = [error ? `${id}-error` : "", hint ? `${id}-hint` : ""].filter(Boolean).join(" ") || undefined;
  return (
    <div className={`fl-field ${error ? "has-error" : ""} ${className}`}>
      <label htmlFor={id}>
        {label}
        {required && <span className="fl-required" aria-hidden="true"> *</span>}
      </label>
      {children({ id, "aria-invalid": Boolean(error), "aria-describedby": describedBy })}
      {hint && !error && (
        <small id={`${id}-hint`} className="fl-field-hint">
          {hint}
        </small>
      )}
      {error && (
        <small id={`${id}-error`} className="fl-field-error" role="alert">
          {error}
        </small>
      )}
    </div>
  );
}

export function FormAlert({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="fl-alert is-error" role="alert">
      <AlertTriangle size={16} aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}

export function LoadingBlock({ label = "Carregando dados do estoque…" }: { label?: string }) {
  return (
    <div className="fl-state">
      <GearLoader label={label} />
    </div>
  );
}

export function ErrorBlock({ message, onRetry }: { message?: string; onRetry: () => void }) {
  return (
    <div className="fl-state is-error" role="alert">
      <AlertTriangle size={20} aria-hidden="true" />
      <strong>Não foi possível carregar</strong>
      <span>{message || "Confira a conexão com o servidor."}</span>
      <button type="button" className="fl-button fl-button-secondary" onClick={onRetry}>
        Tentar novamente
      </button>
    </div>
  );
}

export function EmptyBlock({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <div className="fl-state is-empty" role="status">
      {/* Gancho vazio no painel: só a sombra pintada da ferramenta, como no ShadowBoard. */}
      <svg className="empty-hook" viewBox="0 0 64 72" aria-hidden="true" focusable="false">
        <path className="empty-hook-pegs" d="M8 8h.01M24 8h.01M40 8h.01M56 8h.01M8 64h.01M56 64h.01" />
        <path className="empty-hook-shadow" d="M27 20h10v8l-2 4v28a3 3 0 0 1-6 0V32l-2-4Z" />
        <g className="empty-hook-arm">
          <path d="M32 6v9a4 4 0 0 1-8 0" />
        </g>
      </svg>
      <strong>{title}</strong>
      <span>{description}</span>
      {action}
    </div>
  );
}

export function Pagination({ page, pageCount, total, onChange }: { page: number; pageCount: number; total: number; onChange: (page: number) => void }) {
  const label = useMemo(() => `${number.format(total)} ${total === 1 ? "registro" : "registros"}`, [total]);
  if (pageCount <= 1) return <div className="fl-pagination"><span>{label}</span></div>;
  return (
    <nav className="fl-pagination" aria-label="Paginação">
      <span>{label}</span>
      <div>
        <button type="button" className="fl-icon-button" onClick={() => onChange(page - 1)} disabled={page <= 1} aria-label="Página anterior">
          <ChevronLeft size={16} />
        </button>
        <span aria-live="polite">
          Página {page} de {pageCount}
        </span>
        <button type="button" className="fl-icon-button" onClick={() => onChange(page + 1)} disabled={page >= pageCount} aria-label="Próxima página">
          <ChevronRight size={16} />
        </button>
      </div>
    </nav>
  );
}

/** Mensagem legível a partir de um erro tRPC/rede. */
export function errorMessage(error: unknown, fallback = "Não foi possível concluir a operação.") {
  if (error && typeof error === "object" && "message" in error && typeof (error as { message: unknown }).message === "string") {
    const message = (error as { message: string }).message;
    // Erros de validação do zod chegam como JSON; mostramos a primeira mensagem.
    if (message.startsWith("[")) {
      try {
        const issues = JSON.parse(message) as Array<{ message?: string }>;
        if (issues[0]?.message) return issues[0].message;
      } catch {
        /* mensagem não é JSON */
      }
    }
    if (message === "Failed to fetch") return "Sem conexão com o servidor. Seus dados continuam no formulário.";
    return message || fallback;
  }
  return fallback;
}

/** Converte issues do zod em mapa campo → mensagem. */
export function zodFieldErrors(issues: Array<{ path: PropertyKey[]; message: string }>) {
  const errors: Record<string, string> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? "form");
    if (!errors[key]) errors[key] = issue.message;
  }
  return errors;
}
