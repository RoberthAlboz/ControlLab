import { useEffect, useMemo, useState, type FormEvent } from "react";
import { LoaderCircle } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { outstandingLoanQuantity } from "@shared/inventory";
import { loanCancelSchema, loanCreateSchema, loanReturnSchema } from "@shared/inventory-schemas";
import type { InventoryLoanRow, InventoryOptions } from "@/lib/router-types";
import { errorMessage, Field, FormAlert, formatQuantity, Modal, useRequestKey, zodFieldErrors } from "./InventoryUI";

function useInvalidateInventory() {
  const utils = trpc.useUtils();
  return async () => {
    await utils.inventory.invalidate();
    await utils.learning.catalog.invalidate();
  };
}

export function CreateLoanDialog({
  open,
  onOpenChange,
  presetItemId,
  options,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  presetItemId: number | null;
  options: InventoryOptions;
  onSaved: (message: string) => void;
}) {
  const invalidate = useInvalidateInventory();
  const itemsQuery = trpc.inventory.items.linkable.useQuery(undefined, { enabled: open });
  const mutation = trpc.inventory.loans.create.useMutation();
  const [requestKey, renewKey] = useRequestKey(open);
  const [itemId, setItemId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [borrowerMode, setBorrowerMode] = useState<"student" | "other">("student");
  const [borrowerUserId, setBorrowerUserId] = useState("");
  const [borrowerName, setBorrowerName] = useState("");
  const [classroomId, setClassroomId] = useState("");
  const [purpose, setPurpose] = useState("");
  const [moduleId, setModuleId] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setItemId(presetItemId ? String(presetItemId) : "");
    setQuantity("1");
    setBorrowerMode(options.borrowers.length ? "student" : "other");
    setBorrowerUserId("");
    setBorrowerName("");
    setClassroomId("");
    setPurpose("");
    setModuleId("");
    setDueAt("");
    setErrors({});
    setFormError(null);
  }, [open, presetItemId, options.borrowers.length]);

  const loanable = useMemo(() => (itemsQuery.data ?? []).filter(item => item.returnable), [itemsQuery.data]);
  const item = loanable.find(entry => String(entry.id) === itemId) ?? null;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (mutation.isPending) return;
    setFormError(null);
    const student = options.borrowers.find(entry => String(entry.id) === borrowerUserId);
    const parsed = loanCreateSchema.safeParse({
      itemId: Number(itemId) || 0,
      quantity: quantity.trim() === "" ? Number.NaN : Number(quantity),
      borrowerUserId: borrowerMode === "student" && student ? student.id : null,
      borrowerName: borrowerMode === "student" ? (student?.name ?? "") : borrowerName,
      purpose,
      moduleId: moduleId || null,
      // Aluno cadastrado usa a turma do cadastro (definida pelo servidor).
      classroomId: borrowerMode === "other" && classroomId ? Number(classroomId) : null,
      dueAt: dueAt ? new Date(`${dueAt}T23:59:00`) : null,
      requestKey,
    });
    const nextErrors = parsed.success ? {} : zodFieldErrors(parsed.error.issues);
    if (!itemId) nextErrors.itemId = "Selecione uma ferramenta devolvível.";
    if (borrowerMode === "student" && !student) nextErrors.borrowerName = "Selecione o aluno.";
    if (item && parsed.success && parsed.data.quantity > item.available) {
      nextErrors.quantity = `Há apenas ${item.available} ${item.unit} disponível(is).`;
    }
    if (item && item.status !== "disponivel") nextErrors.itemId = "Item em manutenção ou indisponível.";
    setErrors(nextErrors);
    if (!parsed.success || Object.keys(nextErrors).length) return;
    mutation.mutate(parsed.data, {
      onSuccess: async result => {
        await invalidate();
        renewKey();
        onSaved(result.duplicated ? "Este empréstimo já havia sido registrado." : `Empréstimo #${result.loanId} reservado. Confirme a retirada na entrega.`);
        onOpenChange(false);
      },
      onError: error => setFormError(errorMessage(error)),
    });
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      busy={mutation.isPending}
      title="Novo empréstimo"
      description="O empréstimo reserva a quantidade agora; o saldo físico só diminui quando a retirada é confirmada."
      footer={
        <>
          <button type="button" className="fl-button fl-button-quiet" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            Cancelar
          </button>
          <button type="submit" form="inventory-loan-form" className="fl-button fl-button-primary" disabled={mutation.isPending} aria-busy={mutation.isPending}>
            {mutation.isPending && <LoaderCircle size={15} className="fl-spin" aria-hidden="true" />}
            {mutation.isPending ? "Reservando…" : "Reservar"}
          </button>
        </>
      }
    >
      <form id="inventory-loan-form" className="fl-form-grid" onSubmit={submit} noValidate>
        <FormAlert message={formError} />
        <Field label="Ferramenta" required error={errors.itemId} className="span-2" hint="Somente itens devolvíveis e disponíveis.">
          {props => (
            <select {...props} value={itemId} onChange={e => setItemId(e.target.value)} disabled={itemsQuery.isLoading}>
              <option value="">{itemsQuery.isLoading ? "Carregando…" : "Selecione"}</option>
              {loanable.map(entry => (
                <option key={entry.id} value={entry.id} disabled={entry.status !== "disponivel" || entry.available < 1}>
                  {entry.code} · {entry.name} — {entry.available} {entry.unit} disp.
                  {entry.status !== "disponivel" ? " (indisponível)" : ""}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label={`Quantidade${item ? ` (${item.unit})` : ""}`} required error={errors.quantity} hint={item ? `Disponível: ${formatQuantity(item.available, item.unit)}` : undefined}>
          {props => <input {...props} type="number" min={1} step={1} inputMode="numeric" value={quantity} onChange={e => setQuantity(e.target.value)} />}
        </Field>
        <Field label="Devolução prevista" error={errors.dueAt} hint="Opcional. Atrasos geram alerta.">
          {props => <input {...props} type="date" value={dueAt} min={new Date().toISOString().slice(0, 10)} onChange={e => setDueAt(e.target.value)} />}
        </Field>
        <fieldset className="fl-segmented span-2">
          <legend>Quem recebe</legend>
          <label className={borrowerMode === "student" ? "is-selected" : ""}>
            <input type="radio" name="borrower-mode" checked={borrowerMode === "student"} onChange={() => setBorrowerMode("student")} disabled={!options.borrowers.length} />
            Aluno cadastrado
          </label>
          <label className={borrowerMode === "other" ? "is-selected" : ""}>
            <input type="radio" name="borrower-mode" checked={borrowerMode === "other"} onChange={() => setBorrowerMode("other")} />
            Turma / outra pessoa
          </label>
        </fieldset>
        {borrowerMode === "student" ? (
          <Field label="Aluno" required error={errors.borrowerName} className="span-2">
            {props => (
              <select {...props} value={borrowerUserId} onChange={e => setBorrowerUserId(e.target.value)}>
                <option value="">Selecione o aluno</option>
                {options.borrowers.map(student => (
                  <option key={student.id} value={student.id}>
                    {student.name ?? student.email}
                    {student.classroomName ? ` — ${student.classroomName}` : " — sem turma"}
                  </option>
                ))}
              </select>
            )}
          </Field>
        ) : (
          <>
            <Field label="Nome da turma ou pessoa" required error={errors.borrowerName}>
              {props => <input {...props} value={borrowerName} onChange={e => setBorrowerName(e.target.value)} maxLength={160} placeholder="Ex.: Turma 2B — bancada 3" />}
            </Field>
            <Field label="Turma" error={errors.classroomId} hint="Opcional. Conta o empréstimo para a turma.">
              {props => (
                <select {...props} value={classroomId} onChange={e => setClassroomId(e.target.value)}>
                  <option value="">Nenhuma</option>
                  {options.classrooms.map(classroom => (
                    <option key={classroom.id} value={classroom.id}>
                      {classroom.name}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          </>
        )}
        <Field label="Finalidade" required error={errors.purpose} className="span-2">
          {props => <input {...props} value={purpose} onChange={e => setPurpose(e.target.value)} maxLength={255} placeholder="Ex.: medição das peças da matriz" />}
        </Field>
        <Field label="Módulo relacionado" error={errors.moduleId} className="span-2">
          {props => (
            <select {...props} value={moduleId} onChange={e => setModuleId(e.target.value)}>
              <option value="">Nenhum</option>
              {options.modules.map(module => (
                <option key={module.id} value={module.id}>
                  {module.code} · {module.title}
                </option>
              ))}
            </select>
          )}
        </Field>
      </form>
    </Modal>
  );
}

export function ReturnLoanDialog({ loan, onClose, onSaved }: { loan: InventoryLoanRow | null; onClose: () => void; onSaved: (message: string) => void }) {
  const invalidate = useInvalidateInventory();
  const mutation = trpc.inventory.loans.return.useMutation();
  const [requestKey, renewKey] = useRequestKey(loan?.id ?? null);
  const outstanding = loan ? outstandingLoanQuantity(loan) : 0;
  const [good, setGood] = useState("0");
  const [damaged, setDamaged] = useState("0");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    setGood(String(outstanding));
    setDamaged("0");
    setNote("");
    setErrors({});
    setFormError(null);
  }, [loan?.id, outstanding]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!loan || mutation.isPending) return;
    setFormError(null);
    const parsed = loanReturnSchema.safeParse({
      loanId: loan.id,
      goodQuantity: good.trim() === "" ? Number.NaN : Number(good),
      damagedQuantity: damaged.trim() === "" ? Number.NaN : Number(damaged),
      note,
      requestKey,
    });
    const nextErrors = parsed.success ? {} : zodFieldErrors(parsed.error.issues);
    if (parsed.success) {
      const total = parsed.data.goodQuantity + parsed.data.damagedQuantity;
      if (total < 1) nextErrors.goodQuantity = "Informe ao menos uma unidade devolvida.";
      if (total > outstanding) nextErrors.goodQuantity = `Restam apenas ${outstanding} a devolver.`;
      if (parsed.data.damagedQuantity > 0 && (note.trim().length < 5)) nextErrors.note = "Descreva a avaria encontrada.";
    }
    setErrors(nextErrors);
    if (!parsed.success || Object.keys(nextErrors).length) return;
    mutation.mutate(parsed.data, {
      onSuccess: async result => {
        await invalidate();
        renewKey();
        onSaved(result.duplicated ? "Esta devolução já havia sido registrada." : result.closed ? "Devolução concluída." : `Devolução parcial registrada. Restam ${result.outstanding}.`);
        onClose();
      },
      onError: error => setFormError(errorMessage(error)),
    });
  };

  return (
    <Modal
      open={Boolean(loan)}
      onOpenChange={open => !open && onClose()}
      busy={mutation.isPending}
      title={loan ? `Devolução do empréstimo #${loan.id}` : "Devolução"}
      description={loan ? `${loan.itemCode} · ${loan.itemName} — com ${loan.borrowerName}. Pendente: ${outstanding} ${loan.itemUnit}.` : undefined}
      footer={
        <>
          <button type="button" className="fl-button fl-button-quiet" onClick={onClose} disabled={mutation.isPending}>
            Cancelar
          </button>
          <button type="submit" form="inventory-return-form" className="fl-button fl-button-primary" disabled={mutation.isPending} aria-busy={mutation.isPending}>
            {mutation.isPending && <LoaderCircle size={15} className="fl-spin" aria-hidden="true" />}
            {mutation.isPending ? "Registrando…" : "Registrar devolução"}
          </button>
        </>
      }
    >
      <form id="inventory-return-form" className="fl-form-grid" onSubmit={submit} noValidate>
        <FormAlert message={formError} />
        <Field label="Em bom estado (volta ao saldo)" error={errors.goodQuantity}>
          {props => <input {...props} type="number" min={0} max={outstanding} step={1} value={good} onChange={e => setGood(e.target.value)} />}
        </Field>
        <Field label="Com avaria (não volta ao saldo)" error={errors.damagedQuantity}>
          {props => <input {...props} type="number" min={0} max={outstanding} step={1} value={damaged} onChange={e => setDamaged(e.target.value)} />}
        </Field>
        <Field label="Conferência / observação" error={errors.note} className="span-2" hint="Obrigatória quando houver avaria.">
          {props => <textarea {...props} rows={3} value={note} onChange={e => setNote(e.target.value)} maxLength={1000} />}
        </Field>
      </form>
    </Modal>
  );
}

export function CancelLoanDialog({ loan, onClose, onSaved }: { loan: InventoryLoanRow | null; onClose: () => void; onSaved: (message: string) => void }) {
  const invalidate = useInvalidateInventory();
  const mutation = trpc.inventory.loans.cancel.useMutation();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    setReason("");
    setError(undefined);
    setFormError(null);
  }, [loan?.id]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!loan || mutation.isPending) return;
    const parsed = loanCancelSchema.safeParse({ loanId: loan.id, reason });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message);
    mutation.mutate(parsed.data, {
      onSuccess: async () => {
        await invalidate();
        onSaved(`Empréstimo #${loan.id} cancelado; a reserva foi liberada.`);
        onClose();
      },
      onError: err => setFormError(errorMessage(err)),
    });
  };

  return (
    <Modal
      open={Boolean(loan)}
      onOpenChange={open => !open && onClose()}
      busy={mutation.isPending}
      title={loan ? `Cancelar empréstimo #${loan.id}?` : "Cancelar empréstimo"}
      description="A quantidade reservada volta a ficar disponível. O histórico mantém o registro original."
      footer={
        <>
          <button type="button" className="fl-button fl-button-quiet" onClick={onClose} disabled={mutation.isPending}>
            Voltar
          </button>
          <button type="submit" form="inventory-cancel-form" className="fl-button fl-button-danger" disabled={mutation.isPending} aria-busy={mutation.isPending}>
            {mutation.isPending && <LoaderCircle size={15} className="fl-spin" aria-hidden="true" />}
            Cancelar empréstimo
          </button>
        </>
      }
    >
      <form id="inventory-cancel-form" onSubmit={submit} noValidate>
        <FormAlert message={formError} />
        <Field label="Motivo do cancelamento" required error={error}>
          {props => <textarea {...props} rows={3} value={reason} onChange={e => setReason(e.target.value)} maxLength={255} />}
        </Field>
      </form>
    </Modal>
  );
}
