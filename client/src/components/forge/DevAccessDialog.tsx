import { useState } from "react";
import { Check, Copy, GraduationCap, LogIn, ShieldCheck, Wrench } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Modal } from "@/components/inventory/InventoryUI";

/**
 * Atalho do selo "DEV" na tela de login: mostra as contas de teste da seed
 * (SEED_* do .env) e entra com um clique. O servidor só devolve as contas em
 * desenvolvimento.
 */
type DevAccessDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUse: (email: string, password: string) => void;
  busy: boolean;
};

const ROLE_LABEL = { admin: "Administração", teacher: "Docente", student: "Aluno" } as const;
const ROLE_ICON = { admin: ShieldCheck, teacher: Wrench, student: GraduationCap } as const;

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="fl-icon-button dev-access-copy"
      aria-label={copied ? `${label} copiado` : `Copiar ${label}`}
      onClick={() => {
        void navigator.clipboard?.writeText(value).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1400);
        });
      }}
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
    </button>
  );
}

export default function DevAccessDialog({ open, onOpenChange, onUse, busy }: DevAccessDialogProps) {
  const accountsQuery = trpc.system.devAccounts.useQuery(undefined, { enabled: open, retry: false, staleTime: Infinity });
  const accounts = accountsQuery.data ?? [];

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Acessos de desenvolvimento"
      description="Contas de teste criadas pela seed a partir do .env. Só aparecem no ambiente de desenvolvimento."
      busy={busy}
      size="lg"
    >
      {accountsQuery.isLoading ? (
        <p className="dev-access-empty">Carregando contas…</p>
      ) : accounts.length === 0 ? (
        <p className="dev-access-empty">
          Nenhuma conta de teste configurada. Defina <code>SEED_ADMIN_*</code>, <code>SEED_TEACHER_*</code> e <code>SEED_STUDENT_*</code> no <code>.env</code> e rode <code>pnpm db:seed</code>.
        </p>
      ) : (
        <ul className="dev-access-list">
          {accounts.map(account => {
            const Icon = ROLE_ICON[account.role];
            return (
            <li key={account.role} className={`dev-access-card is-${account.role}`}>
              <div className="dev-access-head">
                <span className="dev-access-icon" aria-hidden="true">
                  <Icon size={18} />
                </span>
                <div>
                  <span className="dev-access-role">{ROLE_LABEL[account.role]}</span>
                  <b>{account.name}</b>
                </div>
              </div>
              <dl className="dev-access-fields">
                <div>
                  <dt>E-mail</dt>
                  <dd>
                    <code>{account.email}</code>
                    <CopyButton value={account.email} label="e-mail" />
                  </dd>
                </div>
                <div>
                  <dt>Senha</dt>
                  <dd>
                    <code>{account.password}</code>
                    <CopyButton value={account.password} label="senha" />
                  </dd>
                </div>
              </dl>
              <button type="button" className="fl-button fl-button-primary dev-access-enter" disabled={busy} onClick={() => onUse(account.email, account.password)}>
                <LogIn size={16} aria-hidden="true" /> Entrar como {ROLE_LABEL[account.role].toLowerCase()}
              </button>
            </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}
