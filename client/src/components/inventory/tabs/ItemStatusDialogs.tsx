import { useEffect, useState, type FormEvent } from "react";

import { ClipboardList, LoaderCircle } from "lucide-react";
import { trpc } from "@/lib/trpc";

import { itemArchiveSchema } from "@shared/inventory-schemas";
import type { InventoryItemRow } from "@/lib/router-types";
import {
  errorMessage,
  Field,
  FormAlert,
  formatQuantity,
  Modal,
} from "@/components/inventory/InventoryUI";

/* ------------------------------------------------------------------ */
/* Arquivar / restaurar                                                */
/* ------------------------------------------------------------------ */

export function ArchiveDialog({
  item,
  onClose,
  onSaved,
}: {
  item: InventoryItemRow | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const utils = trpc.useUtils();
  const mutation = trpc.inventory.items.archive.useMutation();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  useEffect(() => {
    setReason("");
    setError(undefined);
    setFormError(null);
  }, [item?.id]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!item || mutation.isPending) return;
    const parsed = itemArchiveSchema.safeParse({ id: item.id, reason });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message);
    mutation.mutate(parsed.data, {
      onSuccess: async () => {
        await utils.inventory.invalidate();
        await utils.learning.catalog.invalidate();
        onSaved(
          `${item.code} arquivado. O histórico e os módulos continuam mostrando a referência.`
        );
        onClose();
      },
      onError: err => setFormError(errorMessage(err)),
    });
  };

  return (
    <Modal
      open={Boolean(item)}
      onOpenChange={open => !open && onClose()}
      busy={mutation.isPending}
      title={item ? `Arquivar ${item.name}?` : "Arquivar item"}
      description="O item sai das listas e não recebe movimentações. Nada é apagado: movimentações, empréstimos e vínculos com módulos são preservados."
      footer={
        <>
          <button
            type="button"
            className="fl-button fl-button-quiet"
            onClick={onClose}
            disabled={mutation.isPending}
          >
            Cancelar
          </button>
          <button
            type="submit"
            form="inventory-archive-form"
            className="fl-button fl-button-danger"
            disabled={mutation.isPending}
            aria-busy={mutation.isPending}
          >
            {mutation.isPending && (
              <LoaderCircle size={15} className="fl-spin" aria-hidden="true" />
            )}
            Arquivar item
          </button>
        </>
      }
    >
      <form id="inventory-archive-form" onSubmit={submit} noValidate>
        <FormAlert message={formError} />
        {item && item.quantityPhysical > 0 && (
          <div className="fl-alert is-warning" role="status">
            Este item ainda tem{" "}
            {formatQuantity(item.quantityPhysical, item.unit)} em saldo físico.
            Se ele saiu da oficina, registre antes uma saída ou ajuste.
          </div>
        )}
        <Field label="Motivo do arquivamento" required error={error}>
          {props => (
            <textarea
              {...props}
              rows={3}
              value={reason}
              onChange={e => setReason(e.target.value)}
              maxLength={255}
              placeholder="Ex.: ferramenta descartada após avaria"
            />
          )}
        </Field>
      </form>
    </Modal>
  );
}

export function RestoreDialog({
  item,
  onClose,
  onSaved,
}: {
  item: InventoryItemRow | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const utils = trpc.useUtils();
  const mutation = trpc.inventory.items.restore.useMutation();
  const [formError, setFormError] = useState<string | null>(null);
  useEffect(() => setFormError(null), [item?.id]);
  return (
    <Modal
      open={Boolean(item)}
      onOpenChange={open => !open && onClose()}
      busy={mutation.isPending}
      title={item ? `Restaurar ${item.name}?` : "Restaurar item"}
      description="O item volta às listas ativas com o mesmo saldo e histórico."
      footer={
        <>
          <button
            type="button"
            className="fl-button fl-button-quiet"
            onClick={onClose}
            disabled={mutation.isPending}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="fl-button fl-button-primary"
            disabled={mutation.isPending}
            onClick={() =>
              item &&
              mutation.mutate(
                { id: item.id },
                {
                  onSuccess: async () => {
                    await utils.inventory.invalidate();
                    await utils.learning.catalog.invalidate();
                    onSaved(`${item.code} restaurado.`);
                    onClose();
                  },
                  onError: err => setFormError(errorMessage(err)),
                }
              )
            }
          >
            {mutation.isPending && (
              <LoaderCircle size={15} className="fl-spin" aria-hidden="true" />
            )}
            Restaurar
          </button>
        </>
      }
    >
      <FormAlert message={formError} />
      <p className="fl-muted">
        <ClipboardList size={14} aria-hidden="true" /> Arquivado por:{" "}
        {item?.archiveReason ?? "—"}
      </p>
    </Modal>
  );
}
