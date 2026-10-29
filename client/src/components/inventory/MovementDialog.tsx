import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { trpc } from "@/lib/trpc";
import {
  InventoryRuleError,
  MANUAL_MOVEMENT_TYPES,
  MIN_JUSTIFICATION_LENGTH,
  MOVEMENT_REASON_LABELS,
  MOVEMENT_TYPE_LABELS,
  planStockChange,
  REASONS_BY_MANUAL_TYPE,
  type ManualMovementType,
  type MovementReason,
} from "@shared/inventory";
import { movementCreateSchema } from "@shared/inventory-schemas";
import type { InventoryOptions } from "@/lib/router-types";
import { errorMessage, Field, FormAlert, formatQuantity, Modal, useRequestKey, zodFieldErrors } from "./InventoryUI";

const TYPE_HELP: Record<ManualMovementType, string> = {
  entrada: "Recebimento, doação ou contagem que aumenta o saldo físico.",
  saida: "Baixa de consumível, uso em aula, perda ou envio para manutenção.",
  ajuste_entrada: "Correção de saldo para mais, com justificativa obrigatória.",
  ajuste_saida: "Correção de saldo para menos, com justificativa obrigatória.",
};

export default function MovementDialog({
  open,
  onOpenChange,
  presetItemId,
  modules,
  classrooms,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  presetItemId: number | null;
  modules: InventoryOptions["modules"];
  classrooms: InventoryOptions["classrooms"];
  onSaved: (message: string) => void;
}) {
  const utils = trpc.useUtils();
  const itemsQuery = trpc.inventory.items.linkable.useQuery(undefined, { enabled: open });
  const mutation = trpc.inventory.movements.create.useMutation();
  const [requestKey, renewKey] = useRequestKey(open);
  const [itemId, setItemId] = useState<string>("");
  const [type, setType] = useState<ManualMovementType>("entrada");
  const [quantity, setQuantity] = useState("1");
  const [reason, setReason] = useState<MovementReason>("compra");
  const [moduleId, setModuleId] = useState("");
  const [classroomId, setClassroomId] = useState("");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setItemId(presetItemId ? String(presetItemId) : "");
    setType("entrada");
    setQuantity("1");
    setReason("compra");
    setModuleId("");
    setClassroomId("");
    setReference("");
    setNote("");
    setErrors({});
    setFormError(null);
  }, [open, presetItemId]);

  useEffect(() => {
    if (!REASONS_BY_MANUAL_TYPE[type].includes(reason)) setReason(REASONS_BY_MANUAL_TYPE[type][0]);
  }, [type, reason]);

  const item = useMemo(() => itemsQuery.data?.find(entry => String(entry.id) === itemId) ?? null, [itemsQuery.data, itemId]);
  const qty = Number(quantity);
  const isOutflow = type === "saida" || type === "ajuste_saida";
  const needsJustification = type === "ajuste_entrada" || type === "ajuste_saida" || reason === "outro" || reason === "perda" || reason === "avaria";

  // Prévia calculada com as MESMAS regras que o servidor aplica.
  const preview = useMemo(() => {
    if (!item || !Number.isInteger(qty) || qty < 1) return null;
    try {
      const plan = planStockChange(
        { physical: item.physical, reserved: item.reserved, status: item.status, archived: false, returnable: item.returnable },
        type,
        qty,
      );
      if (type === "saida" && reason === "aula" && item.status !== "disponivel") {
        return { error: "Item em manutenção ou indisponível não pode sair para uso em aula." };
      }
      return { plan };
    } catch (error) {
      return { error: error instanceof InventoryRuleError ? error.message : "Movimento inválido." };
    }
  }, [item, qty, type, reason]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (mutation.isPending) return;
    setFormError(null);
    const parsed = movementCreateSchema.safeParse({
      itemId: Number(itemId) || 0,
      type,
      quantity: quantity.trim() === "" ? Number.NaN : Number(quantity),
      reason,
      reference,
      note,
      moduleId: moduleId || null,
      classroomId: isOutflow && classroomId ? Number(classroomId) : null,
      requestKey,
    });
    const nextErrors = parsed.success ? {} : zodFieldErrors(parsed.error.issues);
    if (!itemId) nextErrors.itemId = "Selecione o item.";
    if (needsJustification && note.trim().length < MIN_JUSTIFICATION_LENGTH) {
      nextErrors.note = `Descreva a justificativa (mínimo de ${MIN_JUSTIFICATION_LENGTH} caracteres).`;
    }
    if (preview && "error" in preview && preview.error) nextErrors.quantity = preview.error;
    setErrors(nextErrors);
    if (!parsed.success || Object.keys(nextErrors).length) return;
    mutation.mutate(parsed.data, {
      onSuccess: async result => {
        await utils.inventory.invalidate();
        await utils.learning.catalog.invalidate();
        renewKey();
        onSaved(result.duplicated ? "Esta movimentação já havia sido registrada." : `${MOVEMENT_TYPE_LABELS[type]} registrada. Saldo físico: ${result.physicalAfter}.`);
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
      title="Registrar movimentação"
      description="Toda movimentação fica no histórico com responsável, data e saldo antes e depois."
      footer={
        <>
          <button type="button" className="fl-button fl-button-quiet" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            Cancelar
          </button>
          <button type="submit" form="inventory-movement-form" className="fl-button fl-button-primary" disabled={mutation.isPending} aria-busy={mutation.isPending}>
            {mutation.isPending && <LoaderCircle size={15} className="fl-spin" aria-hidden="true" />}
            {mutation.isPending ? "Registrando…" : "Registrar"}
          </button>
        </>
      }
    >
      <form id="inventory-movement-form" className="fl-form-grid" onSubmit={submit} noValidate>
        <FormAlert message={formError} />
        <Field label="Item" required error={errors.itemId} className="span-2">
          {props => (
            <select {...props} value={itemId} onChange={e => setItemId(e.target.value)} disabled={itemsQuery.isLoading}>
              <option value="">{itemsQuery.isLoading ? "Carregando itens…" : "Selecione um item ativo"}</option>
              {(itemsQuery.data ?? []).map(entry => (
                <option key={entry.id} value={entry.id}>
                  {entry.code} · {entry.name} ({entry.available} {entry.unit} disp.)
                </option>
              ))}
            </select>
          )}
        </Field>
        <fieldset className="fl-segmented span-2">
          <legend>Tipo de movimentação</legend>
          {MANUAL_MOVEMENT_TYPES.map(option => (
            <label key={option} className={type === option ? "is-selected" : ""}>
              <input type="radio" name="movement-type" value={option} checked={type === option} onChange={() => setType(option)} />
              {MOVEMENT_TYPE_LABELS[option]}
            </label>
          ))}
          <small className="fl-field-hint">{TYPE_HELP[type]}</small>
        </fieldset>
        <Field label={`Quantidade${item ? ` (${item.unit})` : ""}`} required error={errors.quantity}>
          {props => <input {...props} type="number" min={1} step={1} inputMode="numeric" value={quantity} onChange={e => setQuantity(e.target.value)} />}
        </Field>
        <Field label="Motivo" required error={errors.reason}>
          {props => (
            <select {...props} value={reason} onChange={e => setReason(e.target.value as MovementReason)}>
              {REASONS_BY_MANUAL_TYPE[type].map(option => (
                <option key={option} value={option}>
                  {MOVEMENT_REASON_LABELS[option]}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Módulo / aula relacionada" error={errors.moduleId} hint="Opcional. Liga a movimentação a um conteúdo.">
          {props => (
            <select {...props} value={moduleId} onChange={e => setModuleId(e.target.value)}>
              <option value="">Nenhum</option>
              {modules.map(module => (
                <option key={module.id} value={module.id}>
                  {module.code} · {module.title}
                </option>
              ))}
            </select>
          )}
        </Field>
        {isOutflow && (
          <Field label="Turma atendida" error={errors.classroomId} hint="Opcional. A administração acompanha o consumo por turma.">
            {props => (
              <select {...props} value={classroomId} onChange={e => setClassroomId(e.target.value)}>
                <option value="">Nenhuma / uso geral</option>
                {classrooms.map(classroom => (
                  <option key={classroom.id} value={classroom.id}>
                    {classroom.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
        )}
        <Field label="Referência" error={errors.reference} hint="Nota fiscal, pedido, turma…">
          {props => <input {...props} value={reference} onChange={e => setReference(e.target.value)} maxLength={120} />}
        </Field>
        <Field label={needsJustification ? "Justificativa" : "Observação"} required={needsJustification} error={errors.note} className="span-2">
          {props => <textarea {...props} value={note} onChange={e => setNote(e.target.value)} rows={3} maxLength={1000} />}
        </Field>
        <div className="fl-preview span-2" aria-live="polite">
          {!item ? (
            <span>Selecione um item para ver o saldo resultante.</span>
          ) : preview && "plan" in preview && preview.plan ? (
            <>
              <span>Saldo físico</span>
              <strong>{formatQuantity(preview.plan.physicalBefore, item.unit)}</strong>
              <ArrowRight size={14} aria-hidden="true" />
              <strong className="is-next">{formatQuantity(preview.plan.physicalAfter, item.unit)}</strong>
              <small>
                Reservado: {preview.plan.reservedAfter} · Disponível depois: {preview.plan.physicalAfter - preview.plan.reservedAfter}
              </small>
            </>
          ) : preview && "error" in preview ? (
            <span className="is-error">{preview.error}</span>
          ) : (
            <span>
              Disponível agora: {formatQuantity(item.available, item.unit)} (físico {item.physical}, reservado {item.reserved}).
            </span>
          )}
        </div>
      </form>
    </Modal>
  );
}
