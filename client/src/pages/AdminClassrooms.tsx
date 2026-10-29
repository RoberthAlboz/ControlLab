/**
 * Turmas (/admin/turmas): cada turma tem um docente responsável — é quem a
 * administração aciona quando algo fora do normal aparece no estoque da turma.
 * Os alunos são vinculados à turma na tela de Usuários.
 */
import { useState, type FormEvent } from "react";
import { Archive, ArchiveRestore, LoaderCircle, Mail, Pencil, Plus } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { isStaffRole } from "@shared/roles";
import { classroomInputSchema, classroomUpdateSchema } from "@shared/user-admin";
import { EmptyBlock, ErrorBlock, errorMessage, Field, FormAlert, LoadingBlock, Modal, zodFieldErrors } from "@/components/inventory/InventoryUI";

type FormState = { id: number | null; name: string; teacherId: string };

export default function AdminClassroomsPage({ onNotify }: { onNotify: (message: string) => void }) {
  const utils = trpc.useUtils();
  const listQuery = trpc.admin.classrooms.list.useQuery();
  const usersQuery = trpc.admin.users.list.useQuery(undefined, { staleTime: 30_000 });
  const createMutation = trpc.admin.classrooms.create.useMutation();
  const updateMutation = trpc.admin.classrooms.update.useMutation();
  const archiveMutation = trpc.admin.classrooms.setArchived.useMutation();
  const [showArchived, setShowArchived] = useState(false);
  const [form, setForm] = useState<FormState | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const saving = createMutation.isPending || updateMutation.isPending;

  const teachers = (usersQuery.data ?? []).filter(user => user.active && isStaffRole(user.role));
  const classrooms = (listQuery.data ?? []).filter(classroom => showArchived || !classroom.archived);
  const withoutTeacher = (listQuery.data ?? []).filter(classroom => !classroom.archived && !classroom.teacherId).length;

  const refresh = () => Promise.all([utils.admin.classrooms.invalidate(), utils.admin.inventory.invalidate(), utils.admin.users.invalidate()]);

  const closeForm = () => {
    setForm(null);
    setErrors({});
    setFormError(null);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!form || saving) return;
    setFormError(null);
    const payload = { name: form.name, teacherId: form.teacherId ? Number(form.teacherId) : null };
    const onError = (error: unknown) => setFormError(errorMessage(error));
    if (form.id === null) {
      const parsed = classroomInputSchema.safeParse(payload);
      if (!parsed.success) return setErrors(zodFieldErrors(parsed.error.issues));
      setErrors({});
      createMutation.mutate(parsed.data, {
        onSuccess: async () => {
          await refresh();
          onNotify(`Turma ${parsed.data.name} criada.`);
          closeForm();
        },
        onError,
      });
    } else {
      const parsed = classroomUpdateSchema.safeParse({ ...payload, id: form.id });
      if (!parsed.success) return setErrors(zodFieldErrors(parsed.error.issues));
      setErrors({});
      updateMutation.mutate(parsed.data, {
        onSuccess: async () => {
          await refresh();
          onNotify("Turma atualizada.");
          closeForm();
        },
        onError,
      });
    }
  };

  return (
    <main className="clean-content inventory-page">
      <header className="inventory-hero">
        <div>
          <div className="breadcrumb">
            ADMINISTRAÇÃO <span>/</span> TURMAS
          </div>
          <h1>
            Turmas e
            <br />
            <em>responsáveis.</em>
          </h1>
          <p>Cada turma tem um docente responsável. Na supervisão do estoque, o consumo é mostrado por turma, e os alertas indicam qual docente acionar.</p>
        </div>
        <div className="inventory-hero-actions">
          <button type="button" className="fl-button fl-button-primary" onClick={() => setForm({ id: null, name: "", teacherId: "" })}>
            <Plus size={15} aria-hidden="true" /> Nova turma
          </button>
        </div>
      </header>

      {withoutTeacher > 0 && (
        <section className="inventory-alerts" role="status">
          <div>
            <strong>
              {withoutTeacher} turma(s) sem docente responsável
            </strong>
            Os alertas dessas turmas vão para quem registrou a operação no estoque.
          </div>
        </section>
      )}

      <section className="inventory-panel" aria-labelledby="admin-classrooms-title">
        <div className="inventory-toolbar">
          <h2 id="admin-classrooms-title" className="inventory-section-title">
            Turmas
          </h2>
          <label className="fl-check">
            <input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} /> Mostrar arquivadas
          </label>
        </div>
        {listQuery.isLoading ? (
          <LoadingBlock label="Carregando turmas…" />
        ) : listQuery.isError ? (
          <ErrorBlock message={listQuery.error.message} onRetry={() => void listQuery.refetch()} />
        ) : classrooms.length === 0 ? (
          <EmptyBlock title="Nenhuma turma cadastrada" description="Crie as turmas e defina o docente responsável por cada uma." />
        ) : (
          <ul className="inventory-category-list admin-user-list">
            {classrooms.map(classroom => (
              <li key={classroom.id} className={classroom.archived ? "is-archived" : ""}>
                <div>
                  <strong>{classroom.name}</strong>
                  <small>
                    {classroom.teacherName ? `Responsável: ${classroom.teacherName}` : "Sem docente responsável"} · {classroom.students} aluno(s) ativo(s)
                    {classroom.archived ? " · arquivada" : ""}
                  </small>
                </div>
                <div className="fl-row-actions">
                  {classroom.teacherEmail && (
                    <a className="fl-icon-button" href={`mailto:${classroom.teacherEmail}?subject=${encodeURIComponent(`Turma ${classroom.name}`)}`} aria-label={`Enviar e-mail para ${classroom.teacherName}`} title="Contatar responsável">
                      <Mail size={15} />
                    </a>
                  )}
                  <button
                    type="button"
                    className="fl-icon-button"
                    onClick={() => setForm({ id: classroom.id, name: classroom.name, teacherId: classroom.teacherId ? String(classroom.teacherId) : "" })}
                    aria-label={`Editar ${classroom.name}`}
                    title="Editar"
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    type="button"
                    className="fl-icon-button"
                    disabled={archiveMutation.isPending}
                    onClick={() =>
                      archiveMutation.mutate(
                        { id: classroom.id, archived: !classroom.archived },
                        {
                          onSuccess: async () => {
                            await refresh();
                            onNotify(classroom.archived ? "Turma restaurada." : "Turma arquivada. O histórico do estoque continua ligado a ela.");
                          },
                          onError: error => onNotify(errorMessage(error)),
                        },
                      )
                    }
                    aria-label={classroom.archived ? `Restaurar ${classroom.name}` : `Arquivar ${classroom.name}`}
                    title={classroom.archived ? "Restaurar" : "Arquivar"}
                  >
                    {classroom.archived ? <ArchiveRestore size={15} /> : <Archive size={15} />}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Modal
        open={Boolean(form)}
        onOpenChange={open => !open && closeForm()}
        busy={saving}
        title={form?.id ? "Editar turma" : "Nova turma"}
        footer={
          <>
            <button type="button" className="fl-button fl-button-quiet" onClick={closeForm} disabled={saving}>
              Cancelar
            </button>
            <button type="submit" form="admin-classroom-form" className="fl-button fl-button-primary" disabled={saving} aria-busy={saving}>
              {saving && <LoaderCircle size={15} className="fl-spin" aria-hidden="true" />}
              Salvar
            </button>
          </>
        }
      >
        {form && (
          <form id="admin-classroom-form" className="fl-form-grid" onSubmit={submit} noValidate>
            <FormAlert message={formError} />
            <Field label="Nome da turma" required error={errors.name} className="span-2">
              {props => <input {...props} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} maxLength={80} placeholder="Ex.: 2º Ano Mecânica A" />}
            </Field>
            <Field label="Docente responsável" error={errors.teacherId} className="span-2" hint="É quem será acionado nos alertas do estoque desta turma.">
              {props => (
                <select {...props} value={form.teacherId} onChange={e => setForm({ ...form, teacherId: e.target.value })}>
                  <option value="">Sem responsável</option>
                  {teachers.map(teacher => (
                    <option key={teacher.id} value={teacher.id}>
                      {teacher.name ?? teacher.email}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          </form>
        )}
      </Modal>
    </main>
  );
}
