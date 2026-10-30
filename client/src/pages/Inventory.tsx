/**
 * Área de estoque (modo docente). Rotas:
 *   /estoque                 itens (lista)
 *   /estoque/painel          itens no painel de ferramentas (5S)
 *   /estoque/emprestimos     empréstimos
 *   /estoque/movimentacoes   histórico de movimentações
 *   /estoque/categorias      categorias
 *
 * A interface só é montada para docentes, mas a proteção real está no
 * servidor: todos os endpoints `inventory.*` exigem o papel docente.
 */
import { useState } from "react";
import { useLocation } from "wouter";
import {
  ArrowLeftRight,
  Boxes,
  HandHelping,
  History,
  Plus,
  Tags,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { STOCK_FILTERS } from "@shared/inventory-schemas";
import type { InventoryItemRow, InventoryOptions } from "@/lib/router-types";
import { ErrorBlock } from "@/components/inventory/InventoryUI";
import ItemFormDialog from "@/components/inventory/ItemFormDialog";
import MovementDialog from "@/components/inventory/MovementDialog";
import ItemDetailSheet from "@/components/inventory/ItemDetailSheet";
import { CreateLoanDialog } from "@/components/inventory/LoanDialogs";
import { ItemsTab } from "@/components/inventory/tabs/ItemsTab";
import { LoansTab } from "@/components/inventory/tabs/LoansTab";
import { MovementsTab } from "@/components/inventory/tabs/MovementsTab";
import { CategoriesTab } from "@/components/inventory/tabs/CategoriesTab";
import {
  ArchiveDialog,
  RestoreDialog,
} from "@/components/inventory/tabs/ItemStatusDialogs";
import {
  INVENTORY_PATHS,
  itemsViewFromPath,
  pathForItemsView,
  tabFromPath,
  type InventoryTab,
} from "@/components/inventory/tabs/inventory-routes";

const TABS: Array<{ id: InventoryTab; label: string; icon: typeof Boxes }> = [
  { id: "itens", label: "Itens", icon: Boxes },
  { id: "emprestimos", label: "Empréstimos", icon: HandHelping },
  { id: "movimentacoes", label: "Movimentações", icon: History },
  { id: "categorias", label: "Categorias", icon: Tags },
];

const EMPTY_OPTIONS: InventoryOptions = {
  categories: [],
  borrowers: [],
  modules: [],
  classrooms: [],
};

export default function InventoryPage({
  onNotify,
  onOpenModule,
}: {
  onNotify: (message: string) => void;
  onOpenModule: (moduleId: string) => void;
}) {
  const [location, navigate] = useLocation();
  const tab = tabFromPath(location);
  const summaryQuery = trpc.inventory.summary.useQuery(undefined, {
    staleTime: 15_000,
  });
  const optionsQuery = trpc.inventory.options.useQuery(undefined, {
    staleTime: 60_000,
  });
  const options = optionsQuery.data ?? EMPTY_OPTIONS;

  const [itemForm, setItemForm] = useState<{
    open: boolean;
    item: InventoryItemRow | null;
  }>({ open: false, item: null });
  const [movement, setMovement] = useState<{
    open: boolean;
    itemId: number | null;
  }>({ open: false, itemId: null });
  const [loanForm, setLoanForm] = useState<{
    open: boolean;
    itemId: number | null;
  }>({ open: false, itemId: null });
  const [detailId, setDetailId] = useState<number | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<InventoryItemRow | null>(
    null
  );
  const [restoreTarget, setRestoreTarget] = useState<InventoryItemRow | null>(
    null
  );
  const [itemFilter, setItemFilter] =
    useState<(typeof STOCK_FILTERS)[number]>("all");

  const totals = summaryQuery.data?.totals;

  return (
    <main className="clean-content inventory-page">
      <header className="inventory-hero">
        <div>
          <div className="breadcrumb">
            ESTOQUE <span>/</span> FERRAMENTARIA
          </div>
          <h1>
            Estoque da
            <br />
            <em>ferramentaria.</em>
          </h1>
          <p>Saldo, localização e empréstimos de cada peça.</p>
        </div>
        <div className="inventory-hero-actions">
          <button
            type="button"
            className="fl-button fl-button-secondary"
            onClick={() => setMovement({ open: true, itemId: null })}
          >
            <ArrowLeftRight size={15} aria-hidden="true" /> Movimentar
          </button>
          <button
            type="button"
            className="fl-button fl-button-secondary"
            onClick={() => setLoanForm({ open: true, itemId: null })}
          >
            <HandHelping size={15} aria-hidden="true" /> Emprestar
          </button>
          <button
            type="button"
            className="fl-button fl-button-primary"
            onClick={() => setItemForm({ open: true, item: null })}
          >
            <Plus size={15} aria-hidden="true" /> Novo item
          </button>
        </div>
      </header>

      <section
        className="inventory-metrics"
        aria-label="Resumo do estoque"
        aria-busy={summaryQuery.isLoading}
      >
        {summaryQuery.isError ? (
          <ErrorBlock
            message="Não foi possível carregar o resumo."
            onRetry={() => void summaryQuery.refetch()}
          />
        ) : (
          <>
            <Metric
              label="Itens"
              value={totals?.items}
              detail={`${totals?.available ?? 0} disponíveis para uso`}
            />
            <Metric
              label="Fora de uso"
              value={
                totals ? totals.maintenance + totals.unavailable : undefined
              }
              detail="manutenção ou sem saldo"
              onClick={() => {
                setItemFilter("unavailable");
                navigate(INVENTORY_PATHS.itens);
              }}
            />
            <Metric
              label="Estoque baixo"
              value={totals?.lowStock}
              detail="no mínimo ou abaixo"
              tone={totals?.lowStock ? "alert" : undefined}
              onClick={() => {
                setItemFilter("low");
                navigate(INVENTORY_PATHS.itens);
              }}
            />
            <Metric
              label="Empréstimos ativos"
              value={totals?.activeLoans}
              detail={
                totals?.overdueLoans
                  ? `${totals.overdueLoans} atrasado(s)`
                  : `${totals?.reservedLoans ?? 0} aguardando retirada`
              }
              tone={totals?.overdueLoans ? "alert" : undefined}
              onClick={() => navigate(INVENTORY_PATHS.emprestimos)}
            />
          </>
        )}
      </section>

      <nav className="inventory-tabs" aria-label="Seções do estoque">
        {TABS.map(entry => {
          const Icon = entry.icon;
          const active = entry.id === tab;
          return (
            <button
              key={entry.id}
              type="button"
              className={active ? "is-active" : ""}
              aria-current={active ? "page" : undefined}
              onClick={() => navigate(INVENTORY_PATHS[entry.id])}
            >
              <Icon size={15} aria-hidden="true" />
              {entry.label}
            </button>
          );
        })}
      </nav>

      {tab === "itens" && (
        <ItemsTab
          options={options}
          view={itemsViewFromPath(location)}
          onViewChange={view => navigate(pathForItemsView(view))}
          filter={itemFilter}
          onFilterChange={setItemFilter}
          onOpenDetail={setDetailId}
          onMove={itemId => setMovement({ open: true, itemId })}
          onEdit={item => setItemForm({ open: true, item })}
          onLoan={itemId => setLoanForm({ open: true, itemId })}
          onArchive={setArchiveTarget}
          onRestore={setRestoreTarget}
          onCreate={() => setItemForm({ open: true, item: null })}
          onNotify={onNotify}
        />
      )}
      {tab === "emprestimos" && (
        <LoansTab
          onNotify={onNotify}
          onCreate={() => setLoanForm({ open: true, itemId: null })}
        />
      )}
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
        classrooms={options.classrooms}
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
      <ArchiveDialog
        item={archiveTarget}
        onClose={() => setArchiveTarget(null)}
        onSaved={onNotify}
      />
      <RestoreDialog
        item={restoreTarget}
        onClose={() => setRestoreTarget(null)}
        onSaved={onNotify}
      />
    </main>
  );
}

function Metric({
  label,
  value,
  detail,
  tone,
  onClick,
}: {
  label: string;
  value: number | undefined;
  detail: string;
  tone?: "alert";
  onClick?: () => void;
}) {
  const content = (
    <>
      <span>{label}</span>
      <strong>{value ?? "—"}</strong>
      <small>{detail}</small>
    </>
  );
  return onClick ? (
    <button
      type="button"
      className={`inventory-metric ${tone === "alert" ? "is-alert" : ""}`}
      onClick={onClick}
    >
      {content}
    </button>
  ) : (
    <div className={`inventory-metric ${tone === "alert" ? "is-alert" : ""}`}>
      {content}
    </div>
  );
}
