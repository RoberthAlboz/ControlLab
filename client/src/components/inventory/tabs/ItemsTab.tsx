import { useEffect, useState } from "react";

import {
  Archive,
  ArchiveRestore,
  ArrowLeftRight,
  HandHelping,
  List,
  Pencil,
  Plus,
  Search,
  Wrench,
  X,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { ITEM_TYPES, ITEM_TYPE_LABELS, type ItemType } from "@shared/inventory";
import { STOCK_FILTERS } from "@shared/inventory-schemas";
import type { InventoryItemRow, InventoryOptions } from "@/lib/router-types";
import {
  EmptyBlock,
  ErrorBlock,
  formatQuantity,
  HealthChip,
  LoadingBlock,
  Pagination,
  useDebouncedValue,
} from "@/components/inventory/InventoryUI";

import ShadowBoard from "@/components/inventory/ShadowBoard";
import { iconFor, ToolGlyph } from "@/components/inventory/ToolGlyph";
import type { ItemsView } from "./inventory-routes";

const FILTER_LABELS: Record<(typeof STOCK_FILTERS)[number], string> = {
  all: "Ativos",
  low: "Estoque baixo",
  unavailable: "Indisponíveis",
  archived: "Arquivados",
};

/* ------------------------------------------------------------------ */
/* Itens                                                               */
/* ------------------------------------------------------------------ */

export function ItemsTab({
  options,
  view,
  onViewChange,
  filter,
  onFilterChange: setFilter,
  onOpenDetail,
  onMove,
  onEdit,
  onLoan,
  onArchive,
  onRestore,
  onCreate,
  onNotify,
}: {
  options: InventoryOptions;
  view: ItemsView;
  onViewChange: (view: ItemsView) => void;
  filter: (typeof STOCK_FILTERS)[number];
  onFilterChange: (filter: (typeof STOCK_FILTERS)[number]) => void;
  onOpenDetail: (id: number) => void;
  onMove: (id: number) => void;
  onEdit: (item: InventoryItemRow) => void;
  onLoan: (id: number) => void;
  onArchive: (item: InventoryItemRow) => void;
  onRestore: (item: InventoryItemRow) => void;
  onCreate: () => void;
  onNotify: (message: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [itemType, setItemType] = useState<ItemType | "">("");
  const [categoryId, setCategoryId] = useState("");
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebouncedValue(search);

  useEffect(() => setPage(1), [debouncedSearch, itemType, categoryId, filter]);

  const listQuery = trpc.inventory.items.list.useQuery(
    {
      search: debouncedSearch,
      itemType: itemType || undefined,
      categoryId: categoryId ? Number(categoryId) : undefined,
      filter,
      page,
      pageSize: 20,
    },
    { placeholderData: previous => previous, enabled: view === "lista" }
  );
  const hasFilters = Boolean(
    search || itemType || categoryId || filter !== "all"
  );

  return (
    <section
      className="inventory-panel"
      aria-labelledby="inventory-items-title"
    >
      <h2 id="inventory-items-title" className="sr-only">
        Itens do estoque
      </h2>
      <div className="inventory-toolbar">
        <div
          className="inventory-view-toggle"
          role="group"
          aria-label="Visualização"
        >
          <button
            type="button"
            className={view === "lista" ? "is-selected" : ""}
            aria-pressed={view === "lista"}
            onClick={() => onViewChange("lista")}
          >
            <List size={15} aria-hidden="true" /> Lista
          </button>
          <button
            type="button"
            className={view === "painel" ? "is-selected" : ""}
            aria-pressed={view === "painel"}
            onClick={() => onViewChange("painel")}
          >
            <Wrench size={15} aria-hidden="true" /> Painel
          </button>
        </div>
        <label className="fl-search">
          <Search size={16} aria-hidden="true" />
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por código, SAP, nome ou local"
            aria-label="Buscar itens"
            maxLength={100}
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              aria-label="Limpar busca"
            >
              <X size={14} />
            </button>
          )}
        </label>
        <select
          value={itemType}
          onChange={e => setItemType(e.target.value as ItemType | "")}
          aria-label="Filtrar por tipo"
        >
          <option value="">Todos os tipos</option>
          {ITEM_TYPES.map(type => (
            <option key={type} value={type}>
              {ITEM_TYPE_LABELS[type]}
            </option>
          ))}
        </select>
        <select
          value={categoryId}
          onChange={e => setCategoryId(e.target.value)}
          aria-label="Filtrar por categoria"
        >
          <option value="">Todas as categorias</option>
          {options.categories.map(category => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
        {view === "lista" && (
          <div className="fl-chip-group" role="group" aria-label="Situação">
            {STOCK_FILTERS.map(value => (
              <button
                key={value}
                type="button"
                className={filter === value ? "is-selected" : ""}
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
              >
                {FILTER_LABELS[value]}
              </button>
            ))}
          </div>
        )}
      </div>

      {view === "painel" ? (
        <ShadowBoard
          search={debouncedSearch}
          itemType={itemType || undefined}
          categoryId={categoryId ? Number(categoryId) : undefined}
          onOpenDetail={onOpenDetail}
          onLoan={onLoan}
          onNotify={onNotify}
        />
      ) : listQuery.isLoading ? (
        <LoadingBlock />
      ) : listQuery.isError ? (
        <ErrorBlock
          message={listQuery.error.message}
          onRetry={() => void listQuery.refetch()}
        />
      ) : !listQuery.data?.items.length ? (
        <EmptyBlock
          title={
            hasFilters ? "Nenhum item encontrado" : "Nenhum item cadastrado"
          }
          description={
            hasFilters
              ? "Ajuste a busca ou os filtros."
              : "Cadastre a primeira ferramenta, máquina ou material."
          }
          action={
            hasFilters ? (
              <button
                type="button"
                className="fl-button fl-button-secondary"
                onClick={() => {
                  setSearch("");
                  setItemType("");
                  setCategoryId("");
                  setFilter("all");
                }}
              >
                Limpar filtros
              </button>
            ) : (
              <button
                type="button"
                className="fl-button fl-button-primary"
                onClick={onCreate}
              >
                <Plus size={15} aria-hidden="true" /> Novo item
              </button>
            )
          }
        />
      ) : (
        <>
          <div
            className={`fl-table-wrap ${listQuery.isFetching ? "is-refreshing" : ""}`}
          >
            <table className="fl-table">
              <thead>
                <tr>
                  <th scope="col">Item</th>
                  <th scope="col">Tipo / categoria</th>
                  <th scope="col">Local</th>
                  <th scope="col" className="num">
                    Disponível
                  </th>
                  <th scope="col">Situação</th>
                  <th scope="col">
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {listQuery.data.items.map(item => (
                  <tr key={item.id}>
                    <td data-label="Item">
                      <div className="inventory-item-cell">
                        <ToolGlyph
                          icon={iconFor(item)}
                          className="inventory-item-glyph"
                        />
                        <div>
                          <button
                            type="button"
                            className="fl-row-title"
                            onClick={() => onOpenDetail(item.id)}
                          >
                            {item.name}
                          </button>
                          <small>
                            {item.code}
                            {item.sapCode ? ` · SAP ${item.sapCode}` : ""}
                            {item.linkedModules
                              ? ` · ${item.linkedModules} módulo(s)`
                              : ""}
                          </small>
                        </div>
                      </div>
                    </td>
                    <td data-label="Tipo">
                      {ITEM_TYPE_LABELS[item.itemType]}
                      <small>{item.categoryName ?? "Sem categoria"}</small>
                    </td>
                    <td data-label="Local">
                      {item.location}
                      <small>{item.sector}</small>
                    </td>
                    <td data-label="Disponível" className="num">
                      <strong>
                        {formatQuantity(item.available, item.unit)}
                      </strong>
                      {item.quantityReserved > 0 && (
                        <small>{item.quantityReserved} reservado(s)</small>
                      )}
                    </td>
                    <td data-label="Situação">
                      <HealthChip health={item.health} />
                    </td>
                    <td className="fl-row-actions">
                      {item.archived ? (
                        <button
                          type="button"
                          className="fl-button fl-button-quiet"
                          onClick={() => onRestore(item)}
                        >
                          <ArchiveRestore size={14} aria-hidden="true" />{" "}
                          Restaurar
                        </button>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="fl-icon-button"
                            onClick={() => onMove(item.id)}
                            aria-label={`Movimentar ${item.name}`}
                            title="Movimentar"
                          >
                            <ArrowLeftRight size={15} />
                          </button>
                          {item.returnable && (
                            <button
                              type="button"
                              className="fl-icon-button"
                              onClick={() => onLoan(item.id)}
                              aria-label={`Emprestar ${item.name}`}
                              title="Emprestar"
                              disabled={
                                item.available < 1 ||
                                item.status !== "disponivel"
                              }
                            >
                              <HandHelping size={15} />
                            </button>
                          )}
                          <button
                            type="button"
                            className="fl-icon-button"
                            onClick={() => onEdit(item)}
                            aria-label={`Editar ${item.name}`}
                            title="Editar"
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            type="button"
                            className="fl-icon-button danger"
                            onClick={() => onArchive(item)}
                            aria-label={`Arquivar ${item.name}`}
                            title="Arquivar"
                          >
                            <Archive size={15} />
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            page={listQuery.data.page}
            pageCount={listQuery.data.pageCount}
            total={listQuery.data.total}
            onChange={setPage}
          />
        </>
      )}
    </section>
  );
}
