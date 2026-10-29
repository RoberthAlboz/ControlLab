/**
 * Área da administração: contas de acesso (/admin/usuarios).
 * Cria logins de alunos, docentes e outros admins, edita dados e tipo de
 * acesso, ativa/desativa contas e redefine senhas.
 *
 * A interface só é montada para admins, mas a proteção real está no
 * servidor: todos os endpoints `admin.*` exigem o papel admin.
 */
import { useMemo, useState, type FormEvent } from "react";
import { KeyRound, LoaderCircle, Pencil, Plus, Search, UserCheck, UserX, X } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { ROLE_LABELS, USER_ROLES, type UserRole } from "@shared/roles";
import { ADMIN_MIN_PASSWORD_LENGTH, userCreateSchema, userPasswordSchema, userUpdateSchema } from "@shared/user-admin";
import type { AdminUserRow } from "@/lib/router-types";
import { EmptyBlock, ErrorBlock, errorMessage, Field, FormAlert, formatDateTime, LoadingBlock, Modal, zodFieldErrors } from "@/components/inventory/InventoryUI";

type RoleFilter = "all" | UserRole | "inactive";

const FILTERS: Array<{ id: RoleFilter; label: string }> = [
  { id: "all", label: "Todas" },
  { id: "student", label: "Alunos" },
  { id: "teacher", label: "Docentes" },
  { id: "admin", label: "Administração" },
  { id: "inactive", label: "Desativadas" },
];

type FormState = { id: number | null; name: string; email: string; role: UserRole; active: boolean; password: string; classroomId: string };

const EMPTY_FORM: FormState = { id: null, name: "", email: "", role: "student", active: true, password: "", classroomId: "" };

/** Converte o estado do formulário para a API (turma só vale para aluno). */
function toPayload(form: FormState) {
  return { ...form, classroomId: form.role === "student" && form.classroomId ? Number(form.classroomId) : null };
}

export default function AdminUsersPage({ currentUserId, onNotify }: { currentUserId: number; onNotify: (message: string) => void }) {
  const utils = trpc.useUtils();
  const listQuery = trpc.admin.users.list.useQuery(undefined, { staleTime: 15_000 });
  const classroomsQuery = trpc.admin.classrooms.list.useQuery(undefined, { staleTime: 30_000 });
  const activeClassrooms = (classroomsQuery.data ?? []).filter(classroom => !classroom.archived);
  const createMutation = trpc.admin.users.create.useMutation();
  const updateMutation = trpc.admin.users.update.useMutation();
  const passwordMutation = trpc.admin.users.resetPassword.useMutation();
  const [filter, setFilter] = useState<RoleFilter>("all");
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<FormState | null>(null);
  const [passwordTarget, setPasswordTarget] = useState<AdminUserRow | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const saving = createMutation.isPending || updateMutation.isPending;

  const users = listQuery.data ?? [];
  const counts = useMemo(() => {
    const active = users.filter(user => user.active);
    return {
      total: users.length,
      student: active.filter(user => user.role === "student").length,
      teacher: active.filter(user => user.role === "teacher").length,
      admin: active.filter(user => user.role === "admin").length,
      inactive: users.length - active.length,
    };
  }, [users]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return users.filter(user => {
      if (filter === "inactive" ? user.active : filter !== "all" && (user.role !== filter || !user.active)) return false;
      if (!term) return true;
      return `${user.name ?? ""} ${user.email ?? ""}`.toLowerCase().includes(term);
    });
  }, [users, filter, search]);

  const closeForm = () => {
    setForm(null);
    setErrors({});
    setFormError(null);
  };

  const closePassword = () => {
    setPasswordTarget(null);
    setNewPassword("");
    setErrors({});
    setFormError(null);
  };

  const refresh = () => Promise.all([utils.admin.users.invalidate(), utils.admin.classrooms.invalidate()]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!form || saving) return;
    setFormError(null);
    const onError = (error: unknown) => setFormError(errorMessage(error));
    if (form.id === null) {
      const parsed = userCreateSchema.safeParse(toPayload(form));
      if (!parsed.success) return setErrors(zodFieldErrors(parsed.error.issues));
      setErrors({});
      createMutation.mutate(parsed.data, {
        onSuccess: async () => {
          await refresh();
          onNotify(`Login criado para ${parsed.data.email}.`);
          closeForm();
        },
        onError,
      });
    } else {
      const parsed = userUpdateSchema.safeParse(toPayload(form));
      if (!parsed.success) return setErrors(zodFieldErrors(parsed.error.issues));
      setErrors({});
      updateMutation.mutate(parsed.data, {
        onSuccess: async () => {
          await refresh();
          onNotify("Conta atualizada.");
          closeForm();
        },
        onError,
      });
    }
  };

  const toggleActive = (user: AdminUserRow) => {
    updateMutation.mutate(
      { id: user.id, name: user.name ?? "", email: user.email ?? "", role: user.role, active: !user.active, classroomId: user.classroomId },
      {
        onSuccess: async () => {
          await refresh();
          onNotify(user.active ? `Conta de ${user.name ?? user.email} desativada. As sessões abertas foram encerradas.` : `Conta de ${user.name ?? user.email} reativada.`);
        },
        onError: error => onNotify(errorMessage(error)),
      },
    );
  };

  const submitPassword = (event: FormEvent) => {
    event.preventDefault();
    if (!passwordTarget || passwordMutation.isPending) return;
    setFormError(null);
    const parsed = userPasswordSchema.safeParse({ id: passwordTarget.id, password: newPassword });
    if (!parsed.success) return setErrors(zodFieldErrors(parsed.error.issues));
    setErrors({});
    passwordMutation.mutate(parsed.data, {
      onSuccess: () => {
        onNotify(`Senha de ${passwordTarget.name ?? passwordTarget.email} redefinida. Informe a nova senha à pessoa.`);
        closePassword();
      },
      onError: error => setFormError(errorMessage(error)),
    });
  };

  const isSelf = form?.id === currentUserId;

  return (
    <main className="clean-content inventory-page admin-users-page">
      <header className="inventory-hero">
        <div>
          <div className="breadcrumb">
            ADMINISTRAÇÃO <span>/</span> USUÁRIOS
          </div>
          <h1>
            Logins e
            <br />
            <em>acessos.</em>
          </h1>
          <p>Crie contas, defina o tipo de acesso e desative quem saiu.</p>
        </div>
        <div className="inventory-hero-actions">
          <button type="button" className="fl-button fl-button-primary" onClick={() => setForm({ ...EMPTY_FORM })}>
            <Plus size={15} aria-hidden="true" /> Novo login
          </button>
        </div>
      </header>

      <section className="inventory-panel" aria-labelledby="admin-users-title">
        <nav className="inventory-tabs" aria-label="Filtrar contas">
          {FILTERS.map(entry => (
            <button key={entry.id} type="button" className={filter === entry.id ? "is-active" : ""} aria-pressed={filter === entry.id} onClick={() => setFilter(entry.id)}>
              {entry.label}
              {listQuery.data && <span className="admin-users-count">{entry.id === "all" ? counts.total : counts[entry.id]}</span>}
            </button>
          ))}
        </nav>
        <div className="inventory-toolbar">
          <h2 id="admin-users-title" className="sr-only">
            Contas
          </h2>
          <label className="fl-search">
            <Search size={16} aria-hidden="true" />
            <input aria-label="Buscar por nome ou e-mail" placeholder="Buscar por nome ou e-mail" value={search} onChange={e => setSearch(e.target.value)} />
            {search && (
              <button type="button" aria-label="Limpar busca" onClick={() => setSearch("")}>
                <X size={13} />
              </button>
            )}
          </label>
        </div>
        {listQuery.isLoading ? (
          <LoadingBlock label="Carregando contas…" />
        ) : listQuery.isError ? (
          <ErrorBlock message={listQuery.error.message} onRetry={() => void listQuery.refetch()} />
        ) : visible.length === 0 ? (
          <EmptyBlock title="Nenhuma conta encontrada" description={search ? "Ajuste a busca ou o filtro." : "Use “Novo login” para cadastrar a primeira conta deste grupo."} />
        ) : (
          <ul className="inventory-category-list admin-user-list">
            {visible.map(user => {
              const self = user.id === currentUserId;
              return (
                <li key={user.id} className={user.active ? "" : "is-archived"}>
                  <div>
                    <strong>
                      {user.name || "Sem nome"}
                      {self && <span className="admin-user-self"> (você)</span>}
                    </strong>
                    <small>
                      {user.email}
                      {user.role === "student" ? ` · ${user.classroomName ?? "sem turma"}` : ""} · último acesso {formatDateTime(user.lastSignedIn)}
                    </small>
                  </div>
                  <span className={`fl-chip admin-role is-${user.role}`}>{ROLE_LABELS[user.role]}</span>
                  {!user.active && <span className="fl-chip admin-role is-inactive">Desativada</span>}
                  <div className="fl-row-actions">
                    <button
                      type="button"
                      className="fl-icon-button"
                      onClick={() =>
                        setForm({ id: user.id, name: user.name ?? "", email: user.email ?? "", role: user.role, active: user.active, password: "", classroomId: user.classroomId ? String(user.classroomId) : "" })
                      }
                      aria-label={`Editar ${user.name ?? user.email}`}
                      title="Editar"
                    >
                      <Pencil size={15} />
                    </button>
                    <button type="button" className="fl-icon-button" onClick={() => setPasswordTarget(user)} aria-label={`Redefinir senha de ${user.name ?? user.email}`} title="Redefinir senha">
                      <KeyRound size={15} />
                    </button>
                    {!self && (
                      <button
                        type="button"
                        className="fl-icon-button"
                        disabled={updateMutation.isPending}
                        onClick={() => toggleActive(user)}
                        aria-label={user.active ? `Desativar ${user.name ?? user.email}` : `Reativar ${user.name ?? user.email}`}
                        title={user.active ? "Desativar" : "Reativar"}
                      >
                        {user.active ? <UserX size={15} /> : <UserCheck size={15} />}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <Modal
        open={Boolean(form)}
        onOpenChange={open => !open && closeForm()}
        busy={saving}
        title={form?.id ? "Editar conta" : "Novo login"}
        description={form?.id ? "Trocar o tipo de acesso encerra as sessões abertas da conta." : "A pessoa entra com este e-mail e a senha definida aqui."}
        footer={
          <>
            <button type="button" className="fl-button fl-button-quiet" onClick={closeForm} disabled={saving}>
              Cancelar
            </button>
            <button type="submit" form="admin-user-form" className="fl-button fl-button-primary" disabled={saving} aria-busy={saving}>
              {saving && <LoaderCircle size={15} className="fl-spin" aria-hidden="true" />}
              {form?.id ? "Salvar" : "Criar login"}
            </button>
          </>
        }
      >
        {form && (
          <form id="admin-user-form" className="fl-form-grid" onSubmit={submit} noValidate>
            <FormAlert message={formError} />
            <Field label="Nome completo" required error={errors.name} className="span-2">
              {props => <input {...props} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} maxLength={120} autoComplete="off" />}
            </Field>
            <Field label="E-mail (login)" required error={errors.email} className="span-2">
              {props => <input {...props} type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} maxLength={320} autoComplete="off" />}
            </Field>
            <Field label="Tipo de acesso" required error={errors.role} hint={isSelf ? "Você não pode alterar o tipo da sua própria conta." : undefined}>
              {props => (
                <select {...props} value={form.role} disabled={isSelf} onChange={e => setForm({ ...form, role: e.target.value as UserRole })}>
                  {USER_ROLES.map(role => (
                    <option key={role} value={role}>
                      {ROLE_LABELS[role]}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            {form.role === "student" && (
              <Field label="Turma" error={errors.classroomId} hint={activeClassrooms.length ? "O que o aluno retira do estoque conta para esta turma." : "Cadastre as turmas na tela Turmas."}>
                {props => (
                  <select {...props} value={form.classroomId} onChange={e => setForm({ ...form, classroomId: e.target.value })}>
                    <option value="">Sem turma</option>
                    {activeClassrooms.map(classroom => (
                      <option key={classroom.id} value={classroom.id}>
                        {classroom.name}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
            )}
            {form.id === null ? (
              <Field label="Senha inicial" required error={errors.password} hint={`Mínimo de ${ADMIN_MIN_PASSWORD_LENGTH} caracteres.`}>
                {props => <input {...props} type="text" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} maxLength={200} autoComplete="new-password" />}
              </Field>
            ) : (
              <label className="fl-check admin-user-active">
                <input type="checkbox" checked={form.active} disabled={isSelf} onChange={e => setForm({ ...form, active: e.target.checked })} /> Conta ativa
              </label>
            )}
          </form>
        )}
      </Modal>

      <Modal
        open={Boolean(passwordTarget)}
        onOpenChange={open => !open && closePassword()}
        busy={passwordMutation.isPending}
        title="Redefinir senha"
        description={passwordTarget ? `${passwordTarget.name ?? ""} · ${passwordTarget.email}. As sessões abertas desta conta serão encerradas.` : undefined}
        footer={
          <>
            <button type="button" className="fl-button fl-button-quiet" onClick={closePassword} disabled={passwordMutation.isPending}>
              Cancelar
            </button>
            <button type="submit" form="admin-password-form" className="fl-button fl-button-primary" disabled={passwordMutation.isPending} aria-busy={passwordMutation.isPending}>
              {passwordMutation.isPending && <LoaderCircle size={15} className="fl-spin" aria-hidden="true" />}
              Redefinir
            </button>
          </>
        }
      >
        <form id="admin-password-form" className="fl-form-grid" onSubmit={submitPassword} noValidate>
          <FormAlert message={formError} />
          <Field label="Nova senha" required error={errors.password} hint={`Mínimo de ${ADMIN_MIN_PASSWORD_LENGTH} caracteres.`} className="span-2">
            {props => <input {...props} type="text" value={newPassword} onChange={e => setNewPassword(e.target.value)} maxLength={200} autoComplete="new-password" />}
          </Field>
        </form>
      </Modal>
    </main>
  );
}


