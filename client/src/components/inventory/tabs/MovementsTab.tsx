import { useEffect, useState } from "react";

import { Search } from "lucide-react";
import { trpc } from "@/lib/trpc";
import {
  MOVEMENT_REASON_LABELS,
  MOVEMENT_TYPES,
  MOVEMENT_TYPE_LABELS,
  type MovementType,
} from "@shared/inventory";

import {
  EmptyBlock,
  ErrorBlock,
  formatDateTime,
  formatQuantity,
  LoadingBlock,
  MovementChip,
  movementSign,
  Pagination,
  useDebouncedValue,
} from "@/components/inventory/InventoryUI";

/* ------------------------------------------------------------------ */
/* Movimentações                                                       */
/* ------------------------------------------------------------------ */

export function MovementsTab({
  onOpenDetail,
}: {
  onOpenDetail: (itemId: number) => void;
}) {
  const [type, setType] = useState<MovementType | "">("");
  const [userId, setUserId] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebouncedValue(search);
  useEffect(() => setPage(1), [type, userId, debouncedSearch]);
  const listQuery = trpc.inventory.movements.list.useQuery(
    {
      type: type || undefined,
      userId: userId ? Number(userId) : undefined,
      search: debouncedSearch,
      page,
      pageSize: 25,
    },
    { placeholderData: previous => previous }
  );

  return (
    <section
      className="inventory-panel"
      aria-labelledby="inventory-movements-title"
    >
      <div className="inventory-toolbar">
        <h2 id="inventory-movements-title" className="inventory-section-title">
          Histórico de movimentações
        </h2>
        <label className="fl-search">
          <Search size={16} aria-hidden="true" />
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Item, referência ou módulo"
            aria-label="Buscar movimentações"
            maxLength={100}
          />
        </label>
        <select
          value={type}
          onChange={e => setType(e.target.value as MovementType | "")}
          aria-label="Filtrar por tipo de movimento"
        >
          <option value="">Todos os movimentos</option>
          {MOVEMENT_TYPES.map(option => (
            <option key={option} value={option}>
              {MOVEMENT_TYPE_LABELS[option]}
            </option>
          ))}
        </select>
        <select
          value={userId}
          onChange={e => setUserId(e.target.value)}
          aria-label="Filtrar por responsável"
        >
          <option value="">Todos os responsáveis</option>
          {(listQuery.data?.responsible ?? []).map(person => (
            <option key={person.id} value={person.id}>
              {person.name ?? `Usuário ${person.id}`}
            </option>
          ))}
        </select>
      </div>
      {listQuery.isLoading ? (
        <LoadingBlock />
      ) : listQuery.isError ? (
        <ErrorBlock
          message={listQuery.error.message}
          onRetry={() => void listQuery.refetch()}
        />
      ) : !listQuery.data?.movements.length ? (
        <EmptyBlock
          title="Nenhuma movimentação encontrada"
          description="Entradas, saídas, ajustes e empréstimos aparecem aqui, sem possibilidade de edição."
        />
      ) : (
        <>
          <div
            className={`fl-table-wrap ${listQuery.isFetching ? "is-refreshing" : ""}`}
          >
            <table className="fl-table">
              <thead>
                <tr>
                  <th scope="col">Quando</th>
                  <th scope="col">Movimento</th>
                  <th scope="col">Item</th>
                  <th scope="col" className="num">
                    Qtd.
                  </th>
                  <th scope="col">Saldo físico</th>
                  <th scope="col">Motivo / referência</th>
                  <th scope="col">Responsável</th>
                </tr>
              </thead>
              <tbody>
                {listQuery.data.movements.map(movement => (
                  <tr key={movement.id}>
                    <td data-label="Quando">
                      {formatDateTime(movement.createdAt)}
                    </td>
                    <td data-label="Movimento">
                      <MovementChip type={movement.movementType} />
                    </td>
                    <td data-label="Item">
                      <button
                        type="button"
                        className="fl-row-title"
                        onClick={() => onOpenDetail(movement.itemId)}
                      >
                        {movement.itemNameSnapshot}
                      </button>
                      <small>{movement.itemCodeSnapshot}</small>
                    </td>
                    <td data-label="Qtd." className="num">
                      <strong>
                        {movementSign(movement.movementType)}
                        {formatQuantity(
                          movement.quantity,
                          movement.unitSnapshot
                        )}
                      </strong>
                    </td>
                    <td data-label="Saldo">
                      {movement.physicalBefore} → {movement.physicalAfter}
                      <small>
                        reservado {movement.reservedBefore} →{" "}
                        {movement.reservedAfter}
                      </small>
                    </td>
                    <td data-label="Motivo">
                      {MOVEMENT_REASON_LABELS[movement.reason]}
                      <small>
                        {[
                          movement.reference,
                          movement.moduleTitleSnapshot,
                          movement.note,
                        ]
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      </small>
                    </td>
                    <td data-label="Responsável">{movement.userName ?? "—"}</td>
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
