import { useState, type FormEvent } from "react";

import {
  Archive,
  ArchiveRestore,
  LoaderCircle,
  Pencil,
  Plus,
} from "lucide-react";
import { trpc } from "@/lib/trpc";

import { categoryInputSchema } from "@shared/inventory-schemas";

import {
  EmptyBlock,
  ErrorBlock,
  errorMessage,
  Field,
  FormAlert,
  LoadingBlock,
  Modal,
} from "@/components/inventory/InventoryUI";

/* ------------------------------------------------------------------ */
/* Categorias                                                          */
/* ------------------------------------------------------------------ */

export function CategoriesTab({
  onNotify,
}: {
  onNotify: (message: string) => void;
}) {
  const utils = trpc.useUtils();
  const [showArchived, setShowArchived] = useState(false);
  const listQuery = trpc.inventory.categories.list.useQuery({
    includeArchived: showArchived,
  });
  const createMutation = trpc.inventory.categories.create.useMutation();
  const updateMutation = trpc.inventory.categories.update.useMutation();
  const archiveMutation = trpc.inventory.categories.setArchived.useMutation();
  const [editing, setEditing] = useState<{
    id: number | null;
    name: string;
    description: string;
  } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const pending = createMutation.isPending || updateMutation.isPending;

  const refresh = async () => {
    await utils.inventory.invalidate();
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!editing || pending) return;
    setFormError(null);
    const parsed = categoryInputSchema.safeParse({
      name: editing.name,
      description: editing.description,
    });
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues)
        next[String(issue.path[0])] ??= issue.message;
      return setErrors(next);
    }
    setErrors({});
    const onError = (error: unknown) => setFormError(errorMessage(error));
    if (editing.id) {
      updateMutation.mutate(
        { id: editing.id, ...parsed.data },
        {
          onSuccess: async () => {
            await refresh();
            onNotify("Categoria atualizada.");
            setEditing(null);
          },
          onError,
        }
      );
    } else {
      createMutation.mutate(parsed.data, {
        onSuccess: async () => {
          await refresh();
          onNotify("Categoria criada.");
          setEditing(null);
        },
        onError,
      });
    }
  };

  return (
    <section
      className="inventory-panel"
      aria-labelledby="inventory-categories-title"
    >
      <div className="inventory-toolbar">
        <h2 id="inventory-categories-title" className="inventory-section-title">
          Categorias
        </h2>
        <label className="fl-check">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={e => setShowArchived(e.target.checked)}
          />{" "}
          Mostrar arquivadas
        </label>
        <button
          type="button"
          className="fl-button fl-button-primary"
          onClick={() => setEditing({ id: null, name: "", description: "" })}
        >
          <Plus size={15} aria-hidden="true" /> Nova categoria
        </button>
      </div>
      {listQuery.isLoading ? (
        <LoadingBlock />
      ) : listQuery.isError ? (
        <ErrorBlock
          message={listQuery.error.message}
          onRetry={() => void listQuery.refetch()}
        />
      ) : !listQuery.data?.length ? (
        <EmptyBlock
          title="Nenhuma categoria"
          description="Categorias organizam os itens (ex.: ferramentas de corte, instrumentos de medição)."
        />
      ) : (
        <ul className="inventory-category-list">
          {listQuery.data.map(category => (
            <li
              key={category.id}
              className={category.archived ? "is-archived" : ""}
            >
              <div>
                <strong>{category.name}</strong>
                <small>
                  {category.description || "Sem descrição"} ·{" "}
                  {category.itemCount} item(ns) ativo(s)
                  {category.archived ? " · arquivada" : ""}
                </small>
              </div>
              <div className="fl-row-actions">
                <button
                  type="button"
                  className="fl-icon-button"
                  onClick={() =>
                    setEditing({
                      id: category.id,
                      name: category.name,
                      description: category.description ?? "",
                    })
                  }
                  aria-label={`Editar ${category.name}`}
                >
                  <Pencil size={15} />
                </button>
                <button
                  type="button"
                  className="fl-icon-button"
                  disabled={archiveMutation.isPending}
                  onClick={() =>
                    archiveMutation.mutate(
                      { id: category.id, archived: !category.archived },
                      {
                        onSuccess: async () => {
                          await refresh();
                          onNotify(
                            category.archived
                              ? "Categoria restaurada."
                              : "Categoria arquivada. Os itens continuam vinculados a ela."
                          );
                        },
                        onError: error => onNotify(errorMessage(error)),
                      }
                    )
                  }
                  aria-label={
                    category.archived
                      ? `Restaurar ${category.name}`
                      : `Arquivar ${category.name}`
                  }
                  title={category.archived ? "Restaurar" : "Arquivar"}
                >
                  {category.archived ? (
                    <ArchiveRestore size={15} />
                  ) : (
                    <Archive size={15} />
                  )}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <Modal
        open={Boolean(editing)}
        onOpenChange={open => !open && setEditing(null)}
        busy={pending}
        title={editing?.id ? "Editar categoria" : "Nova categoria"}
        footer={
          <>
            <button
              type="button"
              className="fl-button fl-button-quiet"
              onClick={() => setEditing(null)}
              disabled={pending}
            >
              Cancelar
            </button>
            <button
              type="submit"
              form="inventory-category-form"
              className="fl-button fl-button-primary"
              disabled={pending}
              aria-busy={pending}
            >
              {pending && (
                <LoaderCircle
                  size={15}
                  className="fl-spin"
                  aria-hidden="true"
                />
              )}
              Salvar
            </button>
          </>
        }
      >
        {editing && (
          <form
            id="inventory-category-form"
            className="fl-form-grid"
            onSubmit={submit}
            noValidate
          >
            <FormAlert message={formError} />
            <Field label="Nome" required error={errors.name} className="span-2">
              {props => (
                <input
                  {...props}
                  value={editing.name}
                  onChange={e =>
                    setEditing({ ...editing, name: e.target.value })
                  }
                  maxLength={80}
                />
              )}
            </Field>
            <Field
              label="Descrição"
              error={errors.description}
              className="span-2"
            >
              {props => (
                <input
                  {...props}
                  value={editing.description}
                  onChange={e =>
                    setEditing({ ...editing, description: e.target.value })
                  }
                  maxLength={255}
                />
              )}
            </Field>
          </form>
        )}
      </Modal>
    </section>
  );
}
