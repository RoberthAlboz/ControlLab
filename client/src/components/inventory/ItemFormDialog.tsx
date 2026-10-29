import { useEffect, useState, type FormEvent } from "react";
import { LoaderCircle, Save } from "lucide-react";
import { trpc } from "@/lib/trpc";
import {
  ITEM_CONSERVATION,
  ITEM_CONSERVATION_LABELS,
  ITEM_ICONS,
  ITEM_ICON_LABELS,
  ITEM_STATUSES,
  ITEM_STATUS_LABELS,
  ITEM_TYPES,
  ITEM_TYPE_LABELS,
  ITEM_UNITS,
  ITEM_UNIT_LABELS,
  type ItemConservation,
  type ItemIcon,
  type ItemStatus,
  type ItemType,
  type ItemUnit,
} from "@shared/inventory";
import { itemCreateSchema, itemUpdateSchema } from "@shared/inventory-schemas";
import type { InventoryItemRow, InventoryOptions } from "@/lib/router-types";
import {
  errorMessage,
  Field,
  FormAlert,
  Modal,
  useRequestKey,
  zodFieldErrors,
} from "./InventoryUI";
import { guessIcon, isItemIcon, ToolGlyph } from "./ToolGlyph";

type FormState = {
  code: string;
  sapCode: string;
  name: string;
  description: string;
  itemType: ItemType;
  categoryId: string;
  unit: ItemUnit;
  returnable: boolean;
  minQuantity: string;
  sector: string;
  location: string;
  conservation: ItemConservation;
  status: ItemStatus;
  /** null = figura automática. */
  icon: ItemIcon | null;
  initialQuantity: string;
  initialReason: "compra" | "doacao" | "inventario";
};

function emptyState(): FormState {
  return {
    code: "",
    sapCode: "",
    name: "",
    description: "",
    itemType: "tool",
    categoryId: "",
    unit: "UN",
    returnable: true,
    minQuantity: "0",
    sector: "Ferramentaria",
    location: "",
    conservation: "bom",
    status: "disponivel",
    icon: null,
    initialQuantity: "0",
    initialReason: "inventario",
  };
}

function stateFromItem(item: InventoryItemRow): FormState {
  return {
    code: item.code,
    sapCode: item.sapCode ?? "",
    name: item.name,
    description: item.description ?? "",
    itemType: item.itemType,
    categoryId: item.categoryId ? String(item.categoryId) : "",
    unit: item.unit,
    returnable: item.returnable,
    minQuantity: String(item.minQuantity),
    sector: item.sector,
    location: item.location,
    conservation: item.conservation,
    status: item.status,
    icon: isItemIcon(item.icon) ? item.icon : null,
    initialQuantity: "0",
    initialReason: "inventario",
  };
}

const toInt = (value: string) =>
  value.trim() === "" ? Number.NaN : Number(value);

function IconChoice({
  icon,
  label,
  selected,
  onSelect,
}: {
  icon: ItemIcon;
  label: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      className={`icon-picker-option${selected ? " is-selected" : ""}`}
      onClick={onSelect}
      title={label}
    >
      <ToolGlyph icon={icon} />
      <span>{label}</span>
    </button>
  );
}

export default function ItemFormDialog({
  open,
  onOpenChange,
  item,
  categories,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: InventoryItemRow | null;
  categories: InventoryOptions["categories"];
  onSaved: (message: string, id: number) => void;
}) {
  const isEdit = Boolean(item);
  const [form, setForm] = useState<FormState>(emptyState);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [requestKey] = useRequestKey(open);
  const utils = trpc.useUtils();
  const createMutation = trpc.inventory.items.create.useMutation();
  const updateMutation = trpc.inventory.items.update.useMutation();
  const pending = createMutation.isPending || updateMutation.isPending;
  const hasStock = Boolean(
    item && (item.quantityPhysical > 0 || item.quantityReserved > 0)
  );

  useEffect(() => {
    if (!open) return;
    setForm(item ? stateFromItem(item) : emptyState());
    setErrors({});
    setFormError(null);
  }, [open, item]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm(current => ({ ...current, [key]: value }));
    if (errors[key as string])
      setErrors(current => ({ ...current, [key]: "" }));
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (pending) return;
    setFormError(null);
    const common = {
      code: form.code,
      sapCode: form.sapCode,
      name: form.name,
      description: form.description,
      itemType: form.itemType,
      categoryId: form.categoryId ? Number(form.categoryId) : null,
      unit: form.unit,
      returnable: form.returnable,
      minQuantity: toInt(form.minQuantity),
      sector: form.sector,
      location: form.location,
      conservation: form.conservation,
      status: form.status,
      icon: form.icon,
    };
    const onError = (error: unknown) => setFormError(errorMessage(error));
    const afterSave = async (message: string, id: number) => {
      await utils.inventory.invalidate();
      await utils.learning.catalog.invalidate();
      onSaved(message, id);
      onOpenChange(false);
    };
    if (item) {
      const parsed = itemUpdateSchema.safeParse({
        ...common,
        id: item.id,
        expectedVersion: item.version,
      });
      if (!parsed.success)
        return setErrors(zodFieldErrors(parsed.error.issues));
      updateMutation.mutate(parsed.data, {
        onSuccess: result =>
          void afterSave(
            result.changed
              ? "Cadastro do item atualizado."
              : "Nenhuma alteração para salvar.",
            item.id
          ),
        onError,
      });
    } else {
      const parsed = itemCreateSchema.safeParse({
        ...common,
        initialQuantity: toInt(form.initialQuantity),
        initialReason: form.initialReason,
        requestKey,
      });
      if (!parsed.success)
        return setErrors(zodFieldErrors(parsed.error.issues));
      createMutation.mutate(parsed.data, {
        onSuccess: result =>
          void afterSave("Item cadastrado no estoque.", result.id),
        onError,
      });
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      busy={pending}
      size="lg"
      title={isEdit ? `Editar ${item?.code}` : "Novo item de estoque"}
      description={
        isEdit
          ? "Quantidades mudam somente por movimentações; aqui ficam os dados de cadastro."
          : "Cadastre ferramentas, máquinas, materiais e peças. A quantidade inicial gera uma entrada no histórico."
      }
      footer={
        <>
          <button
            type="button"
            className="fl-button fl-button-quiet"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancelar
          </button>
          <button
            type="submit"
            form="inventory-item-form"
            className="fl-button fl-button-primary"
            disabled={pending}
            aria-busy={pending}
          >
            {pending ? (
              <LoaderCircle size={15} className="fl-spin" aria-hidden="true" />
            ) : (
              <Save size={15} aria-hidden="true" />
            )}
            {pending
              ? "Salvando…"
              : isEdit
                ? "Salvar alterações"
                : "Cadastrar item"}
          </button>
        </>
      }
    >
      <form
        id="inventory-item-form"
        className="fl-form-grid"
        onSubmit={submit}
        noValidate
      >
        <FormAlert message={formError} />
        <Field
          label="Código patrimonial / interno"
          required
          error={errors.code}
          hint="Único. Ex.: BRC-HSS-008"
        >
          {props => (
            <input
              {...props}
              value={form.code}
              onChange={e => set("code", e.target.value.toUpperCase())}
              maxLength={40}
              autoComplete="off"
            />
          )}
        </Field>
        <Field
          label="Código SAP"
          error={errors.sapCode}
          hint="Opcional; pode se repetir entre itens."
        >
          {props => (
            <input
              {...props}
              value={form.sapCode}
              onChange={e => set("sapCode", e.target.value)}
              maxLength={40}
              inputMode="numeric"
            />
          )}
        </Field>
        <Field
          label="Descrição do item"
          required
          error={errors.name}
          className="span-2"
        >
          {props => (
            <input
              {...props}
              value={form.name}
              onChange={e => set("name", e.target.value)}
              maxLength={180}
            />
          )}
        </Field>
        <fieldset className="fl-field span-2 icon-picker">
          <legend>Figura</legend>
          <div
            className="icon-picker-grid"
            role="radiogroup"
            aria-label="Figura do item"
          >
            <IconChoice
              icon={guessIcon({
                name: form.name,
                code: form.code,
                itemType: form.itemType,
                unit: form.unit,
              })}
              label="Automática"
              selected={form.icon === null}
              onSelect={() => set("icon", null)}
            />
            {ITEM_ICONS.map(icon => (
              <IconChoice
                key={icon}
                icon={icon}
                label={ITEM_ICON_LABELS[icon]}
                selected={form.icon === icon}
                onSelect={() => set("icon", icon)}
              />
            ))}
          </div>
          <small className="fl-field-hint">
            Aparece na lista, no detalhe e no painel de ferramentas.
            "Automática" escolhe pela descrição e pelo tipo.
          </small>
        </fieldset>
        <Field label="Tipo" required error={errors.itemType}>
          {props => (
            <select
              {...props}
              value={form.itemType}
              onChange={e => set("itemType", e.target.value as ItemType)}
            >
              {ITEM_TYPES.map(type => (
                <option key={type} value={type}>
                  {ITEM_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Categoria" error={errors.categoryId}>
          {props => (
            <select
              {...props}
              value={form.categoryId}
              onChange={e => set("categoryId", e.target.value)}
            >
              <option value="">Sem categoria</option>
              {categories.map(category => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field
          label="Unidade de medida"
          required
          error={errors.unit}
          hint={
            isEdit && hasStock
              ? "Bloqueada: o item já tem saldo ou movimentações."
              : "Quantidades são sempre inteiras."
          }
        >
          {props => (
            <select
              {...props}
              value={form.unit}
              onChange={e => set("unit", e.target.value as ItemUnit)}
              disabled={isEdit && hasStock}
            >
              {ITEM_UNITS.map(unit => (
                <option key={unit} value={unit}>
                  {unit} — {ITEM_UNIT_LABELS[unit]}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field
          label="Controle"
          required
          error={errors.returnable}
          hint="Devolvível permite empréstimo; consumível sai por baixa."
        >
          {props => (
            <select
              {...props}
              value={form.returnable ? "1" : "0"}
              onChange={e => set("returnable", e.target.value === "1")}
            >
              <option value="1">Devolvível (empréstimo)</option>
              <option value="0">Consumível (saída)</option>
            </select>
          )}
        </Field>
        <Field label="Setor" required error={errors.sector}>
          {props => (
            <input
              {...props}
              value={form.sector}
              onChange={e => set("sector", e.target.value)}
              maxLength={80}
              list="inventory-sectors"
            />
          )}
        </Field>
        <datalist id="inventory-sectors">
          <option value="Ferramentaria" />
          <option value="Mecânica" />
          <option value="Metrologia" />
          <option value="Almoxarifado" />
        </datalist>
        <Field
          label="Localização física"
          required
          error={errors.location}
          hint="Ex.: Armário A · gaveta 1"
        >
          {props => (
            <input
              {...props}
              value={form.location}
              onChange={e => set("location", e.target.value)}
              maxLength={160}
            />
          )}
        </Field>
        <Field
          label="Estado de conservação"
          required
          error={errors.conservation}
        >
          {props => (
            <select
              {...props}
              value={form.conservation}
              onChange={e =>
                set("conservation", e.target.value as ItemConservation)
              }
            >
              {ITEM_CONSERVATION.map(value => (
                <option key={value} value={value}>
                  {ITEM_CONSERVATION_LABELS[value]}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Disponibilidade" required error={errors.status}>
          {props => (
            <select
              {...props}
              value={form.status}
              onChange={e => set("status", e.target.value as ItemStatus)}
            >
              {ITEM_STATUSES.map(value => (
                <option key={value} value={value}>
                  {ITEM_STATUS_LABELS[value]}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field
          label="Estoque mínimo (alerta)"
          error={errors.minQuantity}
          hint="0 desativa o alerta de estoque baixo."
        >
          {props => (
            <input
              {...props}
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              value={form.minQuantity}
              onChange={e => set("minQuantity", e.target.value)}
            />
          )}
        </Field>
        {!isEdit && (
          <>
            <Field
              label="Quantidade inicial"
              error={errors.initialQuantity}
              hint="Registrada como entrada no histórico."
            >
              {props => (
                <input
                  {...props}
                  type="number"
                  min={0}
                  step={1}
                  inputMode="numeric"
                  value={form.initialQuantity}
                  onChange={e => set("initialQuantity", e.target.value)}
                />
              )}
            </Field>
            <Field
              label="Origem da quantidade inicial"
              error={errors.initialReason}
            >
              {props => (
                <select
                  {...props}
                  value={form.initialReason}
                  onChange={e =>
                    set(
                      "initialReason",
                      e.target.value as FormState["initialReason"]
                    )
                  }
                >
                  <option value="inventario">Contagem de inventário</option>
                  <option value="compra">Compra / recebimento</option>
                  <option value="doacao">Doação</option>
                </select>
              )}
            </Field>
          </>
        )}
        <Field
          label="Observações"
          error={errors.description}
          className="span-2"
        >
          {props => (
            <textarea
              {...props}
              value={form.description}
              onChange={e => set("description", e.target.value)}
              maxLength={2000}
              rows={3}
            />
          )}
        </Field>
      </form>
    </Modal>
  );
}
