/**
 * Área de estoque (modo docente). Rotas:
 *   /estoque                 itens
 *   /estoque/emprestimos     empréstimos
 *   /estoque/movimentacoes   histórico de movimentações
 *   /estoque/categorias      categorias
 *
 * A interface só é montada para docentes, mas a proteção real está no
 * servidor: todos os endpoints `inventory.*` exigem o papel docente.
 */
import { useEffect, useState, type FormEvent } from "react";
import { useLocation } from "wouter";
import {
  AlertTriangle,
  Archive,
  ArchiveRestore,
  ArrowLeftRight,
  Boxes,
  ClipboardList,
  HandHelping,
  History,
  LoaderCircle,
  PackageCheck,
  Pencil,
  Plus,
  Search,
  Tags,
  Undo2,
  X,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import {
  ITEM_TYPES,
  ITEM_TYPE_LABELS,
  MOVEMENT_REASON_LABELS,
  MOVEMENT_TYPES,
  MOVEMENT_TYPE_LABELS,
  type ItemType,
  type LoanStatus,
  type MovementType,
} from "@shared/inventory";
import { categoryInputSchema, itemArchiveSchema, STOCK_FILTERS } from "@shared/inventory-schemas";
import type { InventoryItemRow, InventoryLoanRow, InventoryOptions } from "@/lib/router-types";
import {
  EmptyBlock,
  ErrorBlock,
  errorMessage,
  Field,
  FormAlert,
  formatDate,
  formatDateTime,
  formatQuantity,
  HealthChip,
  LoadingBlock,
  LoanStatusChip,
  Modal,
  MovementChip,
  movementSign,
  Pagination,
  useDebouncedValue,
} from "@/components/inventory/InventoryUI";
import ItemFormDialog from "@/components/inventory/ItemFormDialog";
import MovementDialog from "@/components/inventory/MovementDialog";
import ItemDetailSheet from "@/components/inventory/ItemDetailSheet";
import { CancelLoanDialog, CreateLoanDialog, ReturnLoanDialog } from "@/components/inventory/LoanDialogs";

type Tab = "itens" | "emprestimos" | "movimentacoes" | "categorias";

const TABS: Array<{ id: Tab; label: string; path: string; icon: typeof Boxes }> = [
  { id: "itens", label: "Itens", path: "/estoque", icon: Boxes },
  { id: "emprestimos", label: "Empréstimos", path: "/estoque/emprestimos", icon: HandHelping },
  { id: "movimentacoes", label: "Movimentações", path: "/estoque/movimentacoes", icon: History },
  { id: "categorias", label: "Categorias", path: "/estoque/categorias", icon: Tags },
];

const FILTER_LABELS: Record<(typeof STOCK_FILTERS)[number], string> = {
  all: "Ativos",
  low: "Estoque baixo",
  unavailable: "Indisponíveis",
  archived: "Arquivados",
};

const EMPTY_OPTIONS: InventoryOptions = { categories: [], borrowers: [], modules: [] };

function tabFromPath(path: string): Tab {
  const found = TABS.find(tab => tab.path === path.replace(/\/+$/, ""));
  return found?.id ?? "itens";
}

export default function InventoryPage({ onNotify, onOpenModule }: { onNotify: (message: string) => void; onOpenModule: (moduleId: string) => void }) {
  const [location, navigate] = useLocation();
  const tab = tabFromPath(location);
  const summaryQuery = trpc.inventory.summary.useQuery(undefined, { staleTime: 15_000 });
  const optionsQuery = trpc.inventory.options.useQuery(undefined, { staleTime: 60_000 });
  const options = optionsQuery.data ?? EMPTY_OPTIONS;

  const [itemForm, setItemForm] = useState<{ open: boolean; item: InventoryItemRow | null }>({ open: false, item: null });
  const [movement, setMovement] = useState<{ open: boolean; itemId: number | null }>({ open: false, itemId: null });
  const [loanForm, setLoanForm] = useState<{ open: boolean; itemId: number | null }>({ open: false, itemId: null });
  const [detailId, setDetailId] = useState<number | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<InventoryItemRow | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<InventoryItemRow | null>(null);
  const [itemFilter, setItemFilter] = useState<(typeof STOCK_FILTERS)[number]>("all");

  const totals = summaryQuery.data?.totals;

  return (
    <main className="clean-content inventory-page">
      <header className="inventory-hero">
        <div>
          <div className="breadcrumb">
            MODO DOCENTE <span>/</span> ESTOQUE
          </div>
          <h1>
            Estoque da
            <br />
            <em>ferramentaria.</em>
          </h1>
          <p>Ferramentas, máquinas, materiais e peças com saldo, localização, empréstimos e histórico — visível somente para docentes.</p>
        </div>
        <div className="inventory-hero-actions">
          <button type="button" className="fl-button fl-button-secondary" onClick={() => setMovement({ open: true, itemId: null })}>
            <ArrowLeftRight size={15} aria-hidden="true" /> Movimentar
          </button>
          <button type="button" className="fl-button fl-button-secondary" onClick={() => setLoanForm({ open: true, itemId: null })}>
            <HandHelping size={15} aria-hidden="true" /> Emprestar
          </button>
          <button type="button" className="fl-button fl-button-primary" onClick={() => setItemForm({ open: true, item: null })}>
            <Plus size={15} aria-hidden="true" /> Novo item
          </button>
        </div>
      </header>

      <section className="inventory-metrics" aria-label="Resumo do estoque" aria-busy={summaryQuery.isLoading}>
        {summaryQuery.isError ? (
          <ErrorBlock message="Não foi possível carregar o resumo." onRetry={() => void summaryQuery.refetch()} />
        ) : (
          <>
            <Metric label="Itens cadastrados" value={totals?.items} detail={`${totals?.archived ?? 0} arquivado(s)`} />
            <Metric label="Disponíveis" value={totals?.available} detail="com saldo para uso" />
            <Metric label="Manutenção / indisponíveis" value={totals ? totals.maintenance + totals.unavailable : undefined} detail="inclui itens sem saldo" />
            <Metric label="Estoque baixo" value={totals?.lowStock} detail="no mínimo ou abaixo" tone={totals?.lowStock ? "alert" : undefined} onClick={() => {
                setItemFilter("low");
                navigate("/estoque");
              }} />
            <Metric
              label="Empréstimos ativos"
              value={totals?.activeLoans}
              detail={totals?.overdueLoans ? `${totals.overdueLoans} atrasado(s)` : `${totals?.reservedLoans ?? 0} aguardando retirada`}
              tone={totals?.overdueLoans ? "alert" : undefined}
              onClick={() => navigate("/estoque/emprestimos")}
            />
          </>
        )}
      </section>

      {summaryQuery.data && summaryQuery.data.alerts.length > 0 && tab === "itens" && (
        <section className="inventory-alerts" aria-label="Alertas de estoque">
          <AlertTriangle size={16} aria-hidden="true" />
          <div>
            <strong>Atenção à reposição</strong>
            <ul>
              {summaryQuery.data.alerts.map(alert => (
                <li key={alert.id}>
                  <button type="button" onClick={() => setDetailId(alert.id)}>
                    {alert.code} · {alert.name}: {formatQuantity(alert.available, alert.unit)} disp.
                    {alert.minQuantity ? ` (mín. ${alert.minQuantity})` : ""}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <nav className="inventory-tabs" aria-label="Seções do estoque">
        {TABS.map(entry => {
          const Icon = entry.icon;
          const active = entry.id === tab;
          return (
            <button key={entry.id} type="button" className={active ? "is-active" : ""} aria-current={active ? "page" : undefined} onClick={() => navigate(entry.path)}>
              <Icon size={15} aria-hidden="true" />
              {entry.label}
            </button>
          );
        })}
      </nav>

      {tab === "itens" && (
        <ItemsTab
          options={options}
          filter={itemFilter}
          onFilterChange={setItemFilter}
          onOpenDetail={setDetailId}
          onMove={itemId => setMovement({ open: true, itemId })}
          onEdit={item => setItemForm({ open: true, item })}
          onLoan={itemId => setLoanForm({ open: true, itemId })}
          onArchive={setArchiveTarget}
          onRestore={setRestoreTarget}
          onCreate={() => setItemForm({ open: true, item: null })}
        />
      )}
      {tab === "emprestimos" && <LoansTab onNotify={onNotify} onCreate={() => setLoanForm({ open: true, itemId: null })} />}
      {tab === "movimentacoes" && <MovementsTab onOpenDetail={setDetailId} />}
      {tab === "categorias" && <CategoriesTab onNotify={onNotify} />}

      <ItemFormDialog
        open={itemForm.open}
        item={itemForm.item}
        categories={options.categories}
        onOpenChange={open => setItemForm(current => ({ ...current, open }))}
        onSaved={message => onNotify(message)}
      />
      <MovementDialog
        open={movement.open}
        presetItemId={movement.itemId}
        modules={options.modules}
        onOpenChange={open => setMovement(current => ({ ...current, open }))}
        onSaved={onNotify}
      />
      <CreateLoanDialog
        open={loanForm.open}
        presetItemId={loanForm.itemId}
        options={options}
        onOpenChange={open => setLoanForm(current => ({ ...current, open }))}
        onSaved={onNotify}
      />
      <ItemDetailSheet
        itemId={detailId}
        onClose={() => setDetailId(null)}
        onEdit={item => {
          setDetailId(null);
          setItemForm({ open: true, item });
        }}
        onMove={itemId => {
          setDetailId(null);
          setMovement({ open: true, itemId });
        }}
        onLoan={itemId => {
          setDetailId(null);
          setLoanForm({ open: true, itemId });
        }}
        onArchive={item => {
          setDetailId(null);
          setArchiveTarget(item);
        }}
        onRestore={item => {
          setDetailId(null);
          setRestoreTarget(item);
        }}
        onOpenModule={moduleId => {
          setDetailId(null);
          onOpenModule(moduleId);
        }}
      />
      <ArchiveDialog item={archiveTarget} onClose={() => setArchiveTarget(null)} onSaved={onNotify} />
      <RestoreDialog item={restoreTarget} onClose={() => setRestoreTarget(null)} onSaved={onNotify} />
    </main>
  );
}

function Metric({ label, value, detail, tone, onClick }: { label: string; value: number | undefined; detail: string; tone?: "alert"; onClick?: () => void }) {
  const content = (
    <>
      <span>{label}</span>
      <strong>{value ?? "—"}</strong>
      <small>{detail}</small>
    </>
  );
  return onClick ? (
    <button type="button" className={`inventory-metric ${tone === "alert" ? "is-alert" : ""}`} onClick={onClick}>
      {content}
    </button>
  ) : (
    <div className={`inventory-metric ${tone === "alert" ? "is-alert" : ""}`}>{content}</div>
  );
}

/* ------------------------------------------------------------------ */
/* Itens                                                               */
/* ------------------------------------------------------------------ */

function ItemsTab({
  options,
  filter,
  onFilterChange: setFilter,
  onOpenDetail,
  onMove,
  onEdit,
  onLoan,
  onArchive,
  onRestore,
  onCreate,
}: {
  options: InventoryOptions;
  filter: (typeof STOCK_FILTERS)[number];
  onFilterChange: (filter: (typeof STOCK_FILTERS)[number]) => void;
  onOpenDetail: (id: number) => void;
  onMove: (id: number) => void;
  onEdit: (item: InventoryItemRow) => void;
  onLoan: (id: number) => void;
  onArchive: (item: InventoryItemRow) => void;
  onRestore: (item: InventoryItemRow) => void;
  onCreate: () => void;
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
    { placeholderData: previous => previous },
  );
  const hasFilters = Boolean(search || itemType || categoryId || filter !== "all");

  return (
    <section className="inventory-panel" aria-labelledby="inventory-items-title">
      <h2 id="inventory-items-title" className="sr-only">
        Itens do estoque
      </h2>
      <div className="inventory-toolbar">
        <label className="fl-search">
          <Search size={16} aria-hidden="true" />
          <input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por código, SAP, nome ou local" aria-label="Buscar itens" maxLength={100} />
          {search && (
            <button type="button" onClick={() => setSearch("")} aria-label="Limpar busca">
              <X size={14} />
            </button>
          )}
        </label>
        <select value={itemType} onChange={e => setItemType(e.target.value as ItemType | "")} aria-label="Filtrar por tipo">
          <option value="">Todos os tipos</option>
          {ITEM_TYPES.map(type => (
            <option key={type} value={type}>
              {ITEM_TYPE_LABELS[type]}
            </option>
          ))}
        </select>
        <select value={categoryId} onChange={e => setCategoryId(e.target.value)} aria-label="Filtrar por categoria">
          <option value="">Todas as categorias</option>
          {options.categories.map(category => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
        <div className="fl-chip-group" role="group" aria-label="Situação">
          {STOCK_FILTERS.map(value => (
            <button key={value} type="button" className={filter === value ? "is-selected" : ""} aria-pressed={filter === value} onClick={() => setFilter(value)}>
              {FILTER_LABELS[value]}
            </button>
          ))}
        </div>
      </div>

      {listQuery.isLoading ? (
        <LoadingBlock />
      ) : listQuery.isError ? (
        <ErrorBlock message={listQuery.error.message} onRetry={() => void listQuery.refetch()} />
      ) : !listQuery.data?.items.length ? (
        <EmptyBlock
          title={hasFilters ? "Nenhum item encontrado" : "Nenhum item cadastrado"}
          description={hasFilters ? "Ajuste a busca ou os filtros." : "Cadastre a primeira ferramenta, máquina ou material."}
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
              <button type="button" className="fl-button fl-button-primary" onClick={onCreate}>
                <Plus size={15} aria-hidden="true" /> Novo item
              </button>
            )
          }
        />
      ) : (
        <>
          <div className={`fl-table-wrap ${listQuery.isFetching ? "is-refreshing" : ""}`}>
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
                      <button type="button" className="fl-row-title" onClick={() => onOpenDetail(item.id)}>
                        {item.name}
                      </button>
                      <small>
                        {item.code}
                        {item.sapCode ? ` · SAP ${item.sapCode}` : ""}
                        {item.linkedModules ? ` · ${item.linkedModules} módulo(s)` : ""}
                      </small>
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
                      <strong>{formatQuantity(item.available, item.unit)}</strong>
                      <small>
                        físico {item.quantityPhysical} · res. {item.quantityReserved}
                      </small>
                    </td>
                    <td data-label="Situação">
                      <HealthChip health={item.health} />
                    </td>
                    <td className="fl-row-actions">
                      {item.archived ? (
                        <button type="button" className="fl-button fl-button-quiet" onClick={() => onRestore(item)}>
                          <ArchiveRestore size={14} aria-hidden="true" /> Restaurar
                        </button>
                      ) : (
                        <>
                          <button type="button" className="fl-icon-button" onClick={() => onMove(item.id)} aria-label={`Movimentar ${item.name}`} title="Movimentar">
                            <ArrowLeftRight size={15} />
                          </button>
                          {item.returnable && (
                            <button
                              type="button"
                              className="fl-icon-button"
                              onClick={() => onLoan(item.id)}
                              aria-label={`Emprestar ${item.name}`}
                              title="Emprestar"
                              disabled={item.available < 1 || item.status !== "disponivel"}
                            >
                              <HandHelping size={15} />
                            </button>
                          )}
                          <button type="button" className="fl-icon-button" onClick={() => onEdit(item)} aria-label={`Editar ${item.name}`} title="Editar">
                            <Pencil size={15} />
                          </button>
                          <button type="button" className="fl-icon-button danger" onClick={() => onArchive(item)} aria-label={`Arquivar ${item.name}`} title="Arquivar">
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
          <Pagination page={listQuery.data.page} pageCount={listQuery.data.pageCount} total={listQuery.data.total} onChange={setPage} />
        </>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Empréstimos                                                         */
/* ------------------------------------------------------------------ */

const LOAN_FILTERS: Array<{ value: "active" | "all" | LoanStatus; label: string }> = [
  { value: "active", label: "Em andamento" },
  { value: "reservado", label: "Reservados" },
  { value: "retirado", label: "Retirados" },
  { value: "devolvido", label: "Devolvidos" },
  { value: "cancelado", label: "Cancelados" },
  { value: "all", label: "Todos" },
];

function LoansTab({ onNotify, onCreate }: { onNotify: (message: string) => void; onCreate: () => void }) {
  const utils = trpc.useUtils();
  const [status, setStatus] = useState<"active" | "all" | LoanStatus>("active");
  const [page, setPage] = useState(1);
  const [returning, setReturning] = useState<InventoryLoanRow | null>(null);
  const [cancelling, setCancelling] = useState<InventoryLoanRow | null>(null);
  const [delivering, setDelivering] = useState<InventoryLoanRow | null>(null);
  useEffect(() => setPage(1), [status]);
  const listQuery = trpc.inventory.loans.list.useQuery({ status, page, pageSize: 20 }, { placeholderData: previous => previous });
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
          onNotify(result.alreadyDone ? "Esta retirada já havia sido confirmada." : `Retirada do empréstimo #${delivering.id} confirmada.`);
          setDelivering(null);
        },
        onError: error => setDeliverError(errorMessage(error)),
      },
    );
  };

  return (
    <section className="inventory-panel" aria-labelledby="inventory-loans-title">
      <div className="inventory-toolbar">
        <h2 id="inventory-loans-title" className="inventory-section-title">
          Empréstimos
        </h2>
        <div className="fl-chip-group" role="group" aria-label="Situação do empréstimo">
          {LOAN_FILTERS.map(option => (
            <button key={option.value} type="button" className={status === option.value ? "is-selected" : ""} aria-pressed={status === option.value} onClick={() => setStatus(option.value)}>
              {option.label}
            </button>
          ))}
        </div>
        <button type="button" className="fl-button fl-button-primary" onClick={onCreate}>
          <Plus size={15} aria-hidden="true" /> Novo empréstimo
        </button>
      </div>
      {listQuery.isLoading ? (
        <LoadingBlock />
      ) : listQuery.isError ? (
        <ErrorBlock message={listQuery.error.message} onRetry={() => void listQuery.refetch()} />
      ) : !listQuery.data?.loans.length ? (
        <EmptyBlock title="Nenhum empréstimo nesta situação" description="Empréstimos reservam a ferramenta; a retirada desconta o saldo físico uma única vez." />
      ) : (
        <>
          <div className={`fl-table-wrap ${listQuery.isFetching ? "is-refreshing" : ""}`}>
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
                        {formatDate(loan.createdAt)} · {loan.createdByName ?? "—"}
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
                      <strong>{formatQuantity(loan.quantity, loan.itemUnit)}</strong>
                      <small>
                        {loan.status === "retirado" || loan.status === "devolvido"
                          ? `devolvido ${loan.returnedQuantity} · avaria ${loan.damagedQuantity}`
                          : loan.dueAt
                            ? `prev. ${formatDate(loan.dueAt)}`
                            : "sem prazo"}
                      </small>
                    </td>
                    <td data-label="Situação">
                      <LoanStatusChip status={loan.status} overdue={loan.overdue} />
                      {loan.status === "retirado" && loan.returnedQuantity + loan.damagedQuantity > 0 && <small>Parcial: faltam {loan.outstanding}</small>}
                      {loan.cancelReason && <small>{loan.cancelReason}</small>}
                    </td>
                    <td className="fl-row-actions">
                      {loan.status === "reservado" && (
                        <>
                          <button type="button" className="fl-button fl-button-secondary" onClick={() => setDelivering(loan)}>
                            <PackageCheck size={14} aria-hidden="true" /> Confirmar retirada
                          </button>
                          <button type="button" className="fl-icon-button danger" onClick={() => setCancelling(loan)} aria-label={`Cancelar empréstimo ${loan.id}`} title="Cancelar">
                            <X size={15} />
                          </button>
                        </>
                      )}
                      {loan.status === "retirado" && (
                        <button type="button" className="fl-button fl-button-secondary" onClick={() => setReturning(loan)}>
                          <Undo2 size={14} aria-hidden="true" /> Registrar devolução
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={listQuery.data.page} pageCount={listQuery.data.pageCount} total={listQuery.data.total} onChange={setPage} />
        </>
      )}

      <Modal
        open={Boolean(delivering)}
        onOpenChange={open => !open && setDelivering(null)}
        busy={deliverMutation.isPending}
        title={delivering ? `Confirmar retirada do #${delivering.id}?` : "Confirmar retirada"}
        description={delivering ? `${formatQuantity(delivering.quantity, delivering.itemUnit)} de ${delivering.itemName} para ${delivering.borrowerName}. O saldo físico diminui uma única vez.` : undefined}
        footer={
          <>
            <button type="button" className="fl-button fl-button-quiet" onClick={() => setDelivering(null)} disabled={deliverMutation.isPending}>
              Voltar
            </button>
            <button type="button" className="fl-button fl-button-primary" onClick={confirmDelivery} disabled={deliverMutation.isPending} aria-busy={deliverMutation.isPending}>
              {deliverMutation.isPending && <LoaderCircle size={15} className="fl-spin" aria-hidden="true" />}
              Confirmar retirada
            </button>
          </>
        }
      >
        <FormAlert message={deliverError} />
        <p className="fl-muted">Confira a ferramenta com quem a recebe antes de confirmar.</p>
      </Modal>
      <ReturnLoanDialog loan={returning} onClose={() => setReturning(null)} onSaved={onNotify} />
      <CancelLoanDialog loan={cancelling} onClose={() => setCancelling(null)} onSaved={onNotify} />
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Movimentações                                                       */
/* ------------------------------------------------------------------ */

function MovementsTab({ onOpenDetail }: { onOpenDetail: (itemId: number) => void }) {
  const [type, setType] = useState<MovementType | "">("");
  const [userId, setUserId] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebouncedValue(search);
  useEffect(() => setPage(1), [type, userId, debouncedSearch]);
  const listQuery = trpc.inventory.movements.list.useQuery(
    { type: type || undefined, userId: userId ? Number(userId) : undefined, search: debouncedSearch, page, pageSize: 25 },
    { placeholderData: previous => previous },
  );

  return (
    <section className="inventory-panel" aria-labelledby="inventory-movements-title">
      <div className="inventory-toolbar">
        <h2 id="inventory-movements-title" className="inventory-section-title">
          Histórico de movimentações
        </h2>
        <label className="fl-search">
          <Search size={16} aria-hidden="true" />
          <input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Item, referência ou módulo" aria-label="Buscar movimentações" maxLength={100} />
        </label>
        <select value={type} onChange={e => setType(e.target.value as MovementType | "")} aria-label="Filtrar por tipo de movimento">
          <option value="">Todos os movimentos</option>
          {MOVEMENT_TYPES.map(option => (
            <option key={option} value={option}>
              {MOVEMENT_TYPE_LABELS[option]}
            </option>
          ))}
        </select>
        <select value={userId} onChange={e => setUserId(e.target.value)} aria-label="Filtrar por responsável">
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
        <ErrorBlock message={listQuery.error.message} onRetry={() => void listQuery.refetch()} />
      ) : !listQuery.data?.movements.length ? (
        <EmptyBlock title="Nenhuma movimentação encontrada" description="Entradas, saídas, ajustes e empréstimos aparecem aqui, sem possibilidade de edição." />
      ) : (
        <>
          <div className={`fl-table-wrap ${listQuery.isFetching ? "is-refreshing" : ""}`}>
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
                    <td data-label="Quando">{formatDateTime(movement.createdAt)}</td>
                    <td data-label="Movimento">
                      <MovementChip type={movement.movementType} />
                    </td>
                    <td data-label="Item">
                      <button type="button" className="fl-row-title" onClick={() => onOpenDetail(movement.itemId)}>
                        {movement.itemNameSnapshot}
                      </button>
                      <small>{movement.itemCodeSnapshot}</small>
                    </td>
                    <td data-label="Qtd." className="num">
                      <strong>
                        {movementSign(movement.movementType)}
                        {formatQuantity(movement.quantity, movement.unitSnapshot)}
                      </strong>
                    </td>
                    <td data-label="Saldo">
                      {movement.physicalBefore} → {movement.physicalAfter}
                      <small>
                        reservado {movement.reservedBefore} → {movement.reservedAfter}
                      </small>
                    </td>
                    <td data-label="Motivo">
                      {MOVEMENT_REASON_LABELS[movement.reason]}
                      <small>
                        {[movement.reference, movement.moduleTitleSnapshot, movement.note].filter(Boolean).join(" · ") || "—"}
                      </small>
                    </td>
                    <td data-label="Responsável">{movement.userName ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={listQuery.data.page} pageCount={listQuery.data.pageCount} total={listQuery.data.total} onChange={setPage} />
        </>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Categorias                                                          */
/* ------------------------------------------------------------------ */

function CategoriesTab({ onNotify }: { onNotify: (message: string) => void }) {
  const utils = trpc.useUtils();
  const [showArchived, setShowArchived] = useState(false);
  const listQuery = trpc.inventory.categories.list.useQuery({ includeArchived: showArchived });
  const createMutation = trpc.inventory.categories.create.useMutation();
  const updateMutation = trpc.inventory.categories.update.useMutation();
  const archiveMutation = trpc.inventory.categories.setArchived.useMutation();
  const [editing, setEditing] = useState<{ id: number | null; name: string; description: string } | null>(null);
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
    const parsed = categoryInputSchema.safeParse({ name: editing.name, description: editing.description });
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) next[String(issue.path[0])] ??= issue.message;
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
        },
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
    <section className="inventory-panel" aria-labelledby="inventory-categories-title">
      <div className="inventory-toolbar">
        <h2 id="inventory-categories-title" className="inventory-section-title">
          Categorias
        </h2>
        <label className="fl-check">
          <input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} /> Mostrar arquivadas
        </label>
        <button type="button" className="fl-button fl-button-primary" onClick={() => setEditing({ id: null, name: "", description: "" })}>
          <Plus size={15} aria-hidden="true" /> Nova categoria
        </button>
      </div>
      {listQuery.isLoading ? (
        <LoadingBlock />
      ) : listQuery.isError ? (
        <ErrorBlock message={listQuery.error.message} onRetry={() => void listQuery.refetch()} />
      ) : !listQuery.data?.length ? (
        <EmptyBlock title="Nenhuma categoria" description="Categorias organizam os itens (ex.: ferramentas de corte, instrumentos de medição)." />
      ) : (
        <ul className="inventory-category-list">
          {listQuery.data.map(category => (
            <li key={category.id} className={category.archived ? "is-archived" : ""}>
              <div>
                <strong>{category.name}</strong>
                <small>
                  {category.description || "Sem descrição"} · {category.itemCount} item(ns) ativo(s)
                  {category.archived ? " · arquivada" : ""}
                </small>
              </div>
              <div className="fl-row-actions">
                <button type="button" className="fl-icon-button" onClick={() => setEditing({ id: category.id, name: category.name, description: category.description ?? "" })} aria-label={`Editar ${category.name}`}>
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
                          onNotify(category.archived ? "Categoria restaurada." : "Categoria arquivada. Os itens continuam vinculados a ela.");
                        },
                        onError: error => onNotify(errorMessage(error)),
                      },
                    )
                  }
                  aria-label={category.archived ? `Restaurar ${category.name}` : `Arquivar ${category.name}`}
                  title={category.archived ? "Restaurar" : "Arquivar"}
                >
                  {category.archived ? <ArchiveRestore size={15} /> : <Archive size={15} />}
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
            <button type="button" className="fl-button fl-button-quiet" onClick={() => setEditing(null)} disabled={pending}>
              Cancelar
            </button>
            <button type="submit" form="inventory-category-form" className="fl-button fl-button-primary" disabled={pending} aria-busy={pending}>
              {pending && <LoaderCircle size={15} className="fl-spin" aria-hidden="true" />}
              Salvar
            </button>
          </>
        }
      >
        {editing && (
          <form id="inventory-category-form" className="fl-form-grid" onSubmit={submit} noValidate>
            <FormAlert message={formError} />
            <Field label="Nome" required error={errors.name} className="span-2">
              {props => <input {...props} value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} maxLength={80} />}
            </Field>
            <Field label="Descrição" error={errors.description} className="span-2">
              {props => <input {...props} value={editing.description} onChange={e => setEditing({ ...editing, description: e.target.value })} maxLength={255} />}
            </Field>
          </form>
        )}
      </Modal>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Arquivar / restaurar                                                */
/* ------------------------------------------------------------------ */

function ArchiveDialog({ item, onClose, onSaved }: { item: InventoryItemRow | null; onClose: () => void; onSaved: (message: string) => void }) {
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
        onSaved(`${item.code} arquivado. O histórico e os módulos continuam mostrando a referência.`);
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
          <button type="button" className="fl-button fl-button-quiet" onClick={onClose} disabled={mutation.isPending}>
            Cancelar
          </button>
          <button type="submit" form="inventory-archive-form" className="fl-button fl-button-danger" disabled={mutation.isPending} aria-busy={mutation.isPending}>
            {mutation.isPending && <LoaderCircle size={15} className="fl-spin" aria-hidden="true" />}
            Arquivar item
          </button>
        </>
      }
    >
      <form id="inventory-archive-form" onSubmit={submit} noValidate>
        <FormAlert message={formError} />
        {item && item.quantityPhysical > 0 && (
          <div className="fl-alert is-warning" role="status">
            Este item ainda tem {formatQuantity(item.quantityPhysical, item.unit)} em saldo físico. Se ele saiu da oficina, registre antes uma saída ou ajuste.
          </div>
        )}
        <Field label="Motivo do arquivamento" required error={error}>
          {props => <textarea {...props} rows={3} value={reason} onChange={e => setReason(e.target.value)} maxLength={255} placeholder="Ex.: ferramenta descartada após avaria" />}
        </Field>
      </form>
    </Modal>
  );
}

function RestoreDialog({ item, onClose, onSaved }: { item: InventoryItemRow | null; onClose: () => void; onSaved: (message: string) => void }) {
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
          <button type="button" className="fl-button fl-button-quiet" onClick={onClose} disabled={mutation.isPending}>
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
                },
              )
            }
          >
            {mutation.isPending && <LoaderCircle size={15} className="fl-spin" aria-hidden="true" />}
            Restaurar
          </button>
        </>
      }
    >
      <FormAlert message={formError} />
      <p className="fl-muted">
        <ClipboardList size={14} aria-hidden="true" /> Arquivado por: {item?.archiveReason ?? "—"}
      </p>
    </Modal>
  );
}
