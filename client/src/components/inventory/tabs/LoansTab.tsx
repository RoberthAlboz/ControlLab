import { useEffect, useState } from "react";

import { LoaderCircle, PackageCheck, Plus, Undo2, X } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { type LoanStatus } from "@shared/inventory";

import type { InventoryLoanRow } from "@/lib/router-types";
import {
  EmptyBlock,
  ErrorBlock,
  errorMessage,
  FormAlert,
  formatDate,
  formatQuantity,
  LoadingBlock,
  LoanStatusChip,
  Modal,
  Pagination,
} from "@/components/inventory/InventoryUI";

import {
  CancelLoanDialog,
  ReturnLoanDialog,
} from "@/components/inventory/LoanDialogs";

/* ------------------------------------------------------------------ */
/* Empréstimos                                                         */
/* ------------------------------------------------------------------ */

const LOAN_FILTERS: Array<{
  value: "active" | "all" | LoanStatus;
  label: string;
}> = [
  { value: "active", label: "Em andamento" },
  { value: "reservado", label: "Reservados" },
  { value: "retirado", label: "Retirados" },
  { value: "devolvido", label: "Devolvidos" },
  { value: "cancelado", label: "Cancelados" },
  { value: "all", label: "Todos" },
];

export function LoansTab({
  onNotify,
  onCreate,
}: {
  onNotify: (message: string) => void;
  onCreate: () => void;
}) {
  const utils = trpc.useUtils();
  const [status, setStatus] = useState<"active" | "all" | LoanStatus>("active");
  const [page, setPage] = useState(1);
  const [returning, setReturning] = useState<InventoryLoanRow | null>(null);
  const [cancelling, setCancelling] = useState<InventoryLoanRow | null>(null);
  const [delivering, setDelivering] = useState<InventoryLoanRow | null>(null);
  useEffect(() => setPage(1), [status]);
  const listQuery = trpc.inventory.loans.list.useQuery(
    { status, page, pageSize: 20 },
    { placeholderData: previous => previous }
  );
  const deliverMutation = trpc.inventory.loans.deliver.useMutation();
  const [deliverError, setDeliverError] = useState<string | null>(null);

  const confirmDelivery = () => {
    if (!delivering || deliverMutation.isPending) return;
    setDeliverError(null);
    deliverMutation.mutate(
      { loanId: delivering.id },
      {
        onSuccess: async result => {
          await utils.inventory.invalidate();
          await utils.learning.catalog.invalidate();
          onNotify(
            result.alreadyDone
              ? "Esta retirada já havia sido confirmada."
              : `Retirada do empréstimo #${delivering.id} confirmada.`
          );
          setDelivering(null);
        },
        onError: error => setDeliverError(errorMessage(error)),
      }
    );
  };

  return (
    <section
      className="inventory-panel"
      aria-labelledby="inventory-loans-title"
    >
      <div className="inventory-toolbar">
        <h2 id="inventory-loans-title" className="inventory-section-title">
          Empréstimos
        </h2>
        <div
          className="fl-chip-group"
          role="group"
          aria-label="Situação do empréstimo"
        >
          {LOAN_FILTERS.map(option => (
            <button
              key={option.value}
              type="button"
              className={status === option.value ? "is-selected" : ""}
              aria-pressed={status === option.value}
              onClick={() => setStatus(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="fl-button fl-button-primary"
          onClick={onCreate}
        >
          <Plus size={15} aria-hidden="true" /> Novo empréstimo
        </button>
      </div>
      {listQuery.isLoading ? (
        <LoadingBlock />
      ) : listQuery.isError ? (
        <ErrorBlock
          message={listQuery.error.message}
          onRetry={() => void listQuery.refetch()}
        />
      ) : !listQuery.data?.loans.length ? (
        <EmptyBlock
          title="Nenhum empréstimo nesta situação"
          description="Empréstimos reservam a ferramenta; a retirada desconta o saldo físico uma única vez."
        />
      ) : (
        <>
          <div
            className={`fl-table-wrap ${listQuery.isFetching ? "is-refreshing" : ""}`}
          >
            <table className="fl-table">
              <thead>
                <tr>
                  <th scope="col">Empréstimo</th>
                  <th scope="col">Item</th>
                  <th scope="col">Com quem</th>
                  <th scope="col" className="num">
                    Quantidade
                  </th>
                  <th scope="col">Situação</th>
                  <th scope="col">
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {listQuery.data.loans.map(loan => (
                  <tr key={loan.id}>
                    <td data-label="Empréstimo">
                      <strong>#{loan.id}</strong>
                      <small>
                        {formatDate(loan.createdAt)} ·{" "}
                        {loan.createdByName ?? "—"}
                      </small>
                    </td>
                    <td data-label="Item">
                      {loan.itemName}
                      <small>
                        {loan.itemCode}
                        {loan.moduleTitle ? ` · ${loan.moduleTitle}` : ""}
                      </small>
                    </td>
                    <td data-label="Com quem">
                      {loan.borrowerName}
                      <small>{loan.purpose}</small>
                    </td>
                    <td data-label="Quantidade" className="num">
                      <strong>
                        {formatQuantity(loan.quantity, loan.itemUnit)}
                      </strong>
                      <small>
                        {loan.status === "retirado" ||
                        loan.status === "devolvido"
                          ? `devolvido ${loan.returnedQuantity} · avaria ${loan.damagedQuantity}`
                          : loan.dueAt
                            ? `prev. ${formatDate(loan.dueAt)}`
                            : "sem prazo"}
                      </small>
                    </td>
                    <td data-label="Situação">
                      <LoanStatusChip
                        status={loan.status}
                        overdue={loan.overdue}
                      />
                      {loan.status === "retirado" &&
                        loan.returnedQuantity + loan.damagedQuantity > 0 && (
                          <small>Parcial: faltam {loan.outstanding}</small>
                        )}
                      {loan.cancelReason && <small>{loan.cancelReason}</small>}
                    </td>
                    <td className="fl-row-actions">
                      {loan.status === "reservado" && (
                        <>
                          <button
                            type="button"
                            className="fl-button fl-button-secondary"
                            onClick={() => setDelivering(loan)}
                          >
                            <PackageCheck size={14} aria-hidden="true" />{" "}
                            Confirmar retirada
                          </button>
                          <button
                            type="button"
                            className="fl-icon-button danger"
                            onClick={() => setCancelling(loan)}
                            aria-label={`Cancelar empréstimo ${loan.id}`}
                            title="Cancelar"
                          >
                            <X size={15} />
                          </button>
                        </>
                      )}
                      {loan.status === "retirado" && (
                        <button
                          type="button"
                          className="fl-button fl-button-secondary"
                          onClick={() => setReturning(loan)}
                        >
                          <Undo2 size={14} aria-hidden="true" /> Registrar
                          devolução
                        </button>
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

      <Modal
        open={Boolean(delivering)}
        onOpenChange={open => !open && setDelivering(null)}
        busy={deliverMutation.isPending}
        title={
          delivering
            ? `Confirmar retirada do #${delivering.id}?`
            : "Confirmar retirada"
        }
        description={
          delivering
            ? `${formatQuantity(delivering.quantity, delivering.itemUnit)} de ${delivering.itemName} para ${delivering.borrowerName}. O saldo físico diminui uma única vez.`
            : undefined
        }
        footer={
          <>
            <button
              type="button"
              className="fl-button fl-button-quiet"
              onClick={() => setDelivering(null)}
              disabled={deliverMutation.isPending}
            >
              Voltar
            </button>
            <button
              type="button"
              className="fl-button fl-button-primary"
              onClick={confirmDelivery}
              disabled={deliverMutation.isPending}
              aria-busy={deliverMutation.isPending}
            >
              {deliverMutation.isPending && (
                <LoaderCircle
                  size={15}
                  className="fl-spin"
                  aria-hidden="true"
                />
              )}
              Confirmar retirada
            </button>
          </>
        }
      >
        <FormAlert message={deliverError} />
        <p className="fl-muted">
          Confira a ferramenta com quem a recebe antes de confirmar.
        </p>
      </Modal>
      <ReturnLoanDialog
        loan={returning}
        onClose={() => setReturning(null)}
        onSaved={onNotify}
      />
      <CancelLoanDialog
        loan={cancelling}
        onClose={() => setCancelling(null)}
        onSaved={onNotify}
      />
    </section>
  );
}
