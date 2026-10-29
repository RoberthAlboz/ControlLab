/**
 * Painel de sombras (5S): cada ferramenta devolvível tem seu lugar pintado no
 * painel. A cor da estação diz o estado sem precisar ler (tudo no lugar, com
 * alguém, atrasada, manutenção), as bolinhas contam as unidades no gancho e a
 * etiqueta mostra com quem está. Clicar na ferramenta abre quem está com cada
 * unidade, com Devolver ao lado de cada nome.
 */
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { ArrowUpRight, Undo2, X } from "lucide-react";
import { trpc } from "@/lib/trpc";
import type { ItemType } from "@shared/inventory";
import type { InventoryItemRow, InventoryLoanRow } from "@/lib/router-types";
import {
  EmptyBlock,
  ErrorBlock,
  formatDate,
  formatQuantity,
  LoadingBlock,
} from "./InventoryUI";
import { ReturnLoanDialog } from "./LoanDialogs";
import { iconFor, SHAPES, ToolSvg, type ToolShape } from "./ToolGlyph";

type StationState = "complete" | "partial" | "away" | "overdue" | "maintenance";

type Station = {
  item: InventoryItemRow;
  shape: ToolShape;
  state: StationState;
  /** Unidades fisicamente no gancho (as reservadas continuam penduradas). */
  onHook: number;
  /** Reservadas: no gancho, mas prometidas a alguém. */
  reserved: number;
  /** Retiradas e ainda não devolvidas. */
  lentOut: number;
  total: number;
  loans: InventoryLoanRow[];
};

const STATE_LABELS: Record<StationState, string> = {
  complete: "Tudo no lugar",
  partial: "Com alguém",
  away: "Com alguém",
  overdue: "Atrasada",
  maintenance: "Manutenção",
};

/** Filtros do resumo: "parcial" e "toda fora" contam juntos como "com alguém". */
type BoardFilter = "all" | "complete" | "out" | "overdue" | "maintenance";
const FILTERS: Array<{ id: Exclude<BoardFilter, "all">; label: string; match: (state: StationState) => boolean }> = [
  { id: "complete", label: "Tudo no lugar", match: state => state === "complete" },
  { id: "out", label: "Com alguém", match: state => state === "partial" || state === "away" },
  { id: "overdue", label: "Atrasadas", match: state => state === "overdue" },
  { id: "maintenance", label: "Manutenção", match: state => state === "maintenance" },
];

/** Acima disso as bolinhas viram só o número (não cabem embaixo da peça). */
const MAX_DOTS = 8;

function stationOf(item: InventoryItemRow, allLoans: InventoryLoanRow[]): Station {
  const loans = allLoans
    .filter(loan => loan.itemId === item.id)
    // Atrasados primeiro, depois retirados (estão fora), depois reservas.
    .sort((a, b) => Number(b.overdue) - Number(a.overdue) || Number(b.status === "retirado") - Number(a.status === "retirado"));
  const lentOut = loans
    .filter(loan => loan.status === "retirado")
    .reduce((sum, loan) => sum + loan.outstanding, 0);
  const maintenance = item.status !== "disponivel";
  const onHook = maintenance ? 0 : item.quantityPhysical;
  const reserved = maintenance ? 0 : item.quantityReserved;
  const state: StationState = loans.some(loan => loan.overdue)
    ? "overdue"
    : maintenance
      ? "maintenance"
      : lentOut === 0 && reserved === 0
        ? "complete"
        : onHook - reserved > 0
          ? "partial"
          : "away";
  return {
    item,
    shape: SHAPES[iconFor(item)],
    state,
    onHook,
    reserved,
    lentOut,
    total: item.quantityPhysical + lentOut,
    loans,
  };
}

/** Texto curto da etiqueta: com quem está e até quando. */
function tagText(station: Station) {
  if (station.state === "maintenance") return { main: "Em manutenção", detail: null };
  if (station.state === "complete") return { main: "Tudo no lugar", detail: null };
  const [first, ...rest] = station.loans;
  if (!first) return { main: "Sem saldo", detail: null };
  const who = `${first.status === "reservado" ? "Reservada · " : ""}${first.borrowerName}${rest.length ? ` +${rest.length}` : ""}`;
  const detail = first.dueAt
    ? `${first.overdue ? "venceu" : "devolve"} ${formatDate(first.dueAt)}`
    : first.status === "reservado"
      ? "aguardando retirada"
      : null;
  return { main: who, detail };
}

function UnitDots({ station }: { station: Station }) {
  const { total, onHook, reserved, state } = station;
  if (total <= 0) return null;
  const free = Math.max(0, onHook - reserved);
  const label = state === "maintenance"
    ? `${total} em manutenção`
    : `${onHook} de ${total} no gancho${reserved ? `, ${reserved} reservada(s)` : ""}`;
  return (
    <div className="shadow-station-units" aria-label={label} title={label}>
      {total <= MAX_DOTS && (
        <span className="shadow-station-dots" aria-hidden="true">
          {Array.from({ length: total }, (_, index) => (
            <i
              key={index}
              className={
                state === "maintenance"
                  ? "is-maintenance"
                  : index < free
                    ? "is-free"
                    : index < onHook
                      ? "is-reserved"
                      : "is-out"
              }
            />
          ))}
        </span>
      )}
      <small aria-hidden="true">
        {state === "maintenance"
          ? `${total} em reparo`
          : `${onHook}/${total} no gancho${reserved ? ` · ${reserved} reserv.` : ""}`}
      </small>
    </div>
  );
}

export default function ShadowBoard({
  search,
  itemType,
  categoryId,
  onOpenDetail,
  onLoan,
  onNotify,
}: {
  search: string;
  itemType?: ItemType;
  categoryId?: number;
  onOpenDetail: (id: number) => void;
  onLoan: (id: number) => void;
  onNotify: (message: string) => void;
}) {
  const itemsQuery = trpc.inventory.items.list.useQuery(
    { search, itemType, categoryId, filter: "all", page: 1, pageSize: 100 },
    { placeholderData: previous => previous }
  );
  const loansQuery = trpc.inventory.loans.list.useQuery({
    status: "active",
    page: 1,
    pageSize: 100,
  });
  const [returning, setReturning] = useState<InventoryLoanRow | null>(null);
  const [filter, setFilter] = useState<BoardFilter>("all");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const detailRef = useRef<HTMLElement | null>(null);

  const stations = useMemo<Station[]>(() => {
    const loans = loansQuery.data?.loans ?? [];
    return (itemsQuery.data?.items ?? [])
      .filter(item => item.returnable && !item.archived)
      .map(item => stationOf(item, loans));
  }, [itemsQuery.data, loansQuery.data]);

  // Guarda quem estava no gancho para animar só a volta (não a primeira carga).
  const seen = useRef(new Map<number, number>());
  const [returned, setReturned] = useState<Set<number>>(new Set());
  useEffect(() => {
    const back = new Set<number>();
    for (const station of stations) {
      const before = seen.current.get(station.item.id);
      if (before !== undefined && station.onHook > before) back.add(station.item.id);
      seen.current.set(station.item.id, station.onHook);
    }
    if (!back.size) return;
    setReturned(back);
    const timer = window.setTimeout(() => setReturned(new Set()), 1400);
    return () => window.clearTimeout(timer);
  }, [stations]);

  // A animação de pendurar uma a uma só vale na primeira montagem do painel.
  const [mounting, setMounting] = useState(true);
  const hasStations = stations.length > 0;
  useEffect(() => {
    if (!hasStations || !mounting) return;
    const timer = window.setTimeout(
      () => setMounting(false),
      1400 + stations.length * 55
    );
    return () => window.clearTimeout(timer);
  }, [hasStations, mounting, stations.length]);

  useEffect(() => {
    if (selectedId !== null) detailRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [selectedId]);

  if (itemsQuery.isLoading || loansQuery.isLoading)
    return <LoadingBlock label="Montando o painel de ferramentas…" />;
  if (itemsQuery.isError)
    return (
      <ErrorBlock
        message={itemsQuery.error.message}
        onRetry={() => void itemsQuery.refetch()}
      />
    );
  if (loansQuery.isError)
    return (
      <ErrorBlock
        message={loansQuery.error.message}
        onRetry={() => void loansQuery.refetch()}
      />
    );

  const counts = Object.fromEntries(
    FILTERS.map(option => [option.id, stations.filter(station => option.match(station.state)).length])
  ) as Record<Exclude<BoardFilter, "all">, number>;
  const activeFilter = FILTERS.find(option => option.id === filter);
  const visible = activeFilter ? stations.filter(station => activeFilter.match(station.state)) : stations;
  const selected = stations.find(station => station.item.id === selectedId) ?? null;

  return (
    <>
      {!stations.length ? (
        <EmptyBlock
          title="Nenhuma ferramenta devolvível"
          description="Itens marcados como devolvíveis aparecem aqui, cada um no seu gancho. Consumíveis ficam só na lista."
        />
      ) : (
        <>
          <div className="shadow-board-summary" role="group" aria-label="Filtrar o painel por situação">
            <button
              type="button"
              className={`shadow-chip${filter === "all" ? " is-active" : ""}`}
              aria-pressed={filter === "all"}
              onClick={() => setFilter("all")}
            >
              Todas <b>{stations.length}</b>
            </button>
            {FILTERS.map(option => (
              <button
                key={option.id}
                type="button"
                className={`shadow-chip is-${option.id}${filter === option.id ? " is-active" : ""}`}
                aria-pressed={filter === option.id}
                disabled={!counts[option.id] && filter !== option.id}
                onClick={() => setFilter(current => (current === option.id ? "all" : option.id))}
              >
                <i aria-hidden="true" /> {option.label} <b>{counts[option.id]}</b>
              </button>
            ))}
          </div>

          {!visible.length ? (
            <p className="fl-muted shadow-board-none">Nenhuma ferramenta nesta situação.</p>
          ) : (
            <div className={`shadow-board${mounting ? " is-mounting" : ""}`} role="list">
              {visible.map((station, index) => {
                const { item, shape, state, onHook } = station;
                const tag = tagText(station);
                const isSelected = station.item.id === selectedId;
                return (
                  <div
                    key={item.id}
                    role="listitem"
                    className={`shadow-station is-${state}${onHook > 0 ? "" : " is-out"}${returned.has(item.id) ? " is-back" : ""}${isSelected ? " is-selected" : ""}`}
                    style={{ "--i": index } as CSSProperties}
                  >
                    <button
                      type="button"
                      className="shadow-station-hook"
                      onClick={() => setSelectedId(current => (current === item.id ? null : item.id))}
                      aria-expanded={isSelected}
                      aria-controls="shadow-board-detail"
                      aria-label={`${item.name}: ${STATE_LABELS[state]}, ${onHook} de ${station.total} no gancho. Ver com quem está`}
                    >
                      <svg viewBox="0 0 60 122" aria-hidden="true" focusable="false">
                        <circle cx="30" cy="7" r="2.6" className="shadow-board-peg" />
                        <ToolSvg shape={shape} className="shadow-board-outline" />
                        <g className="shadow-board-tool">
                          <ToolSvg shape={shape} className="shadow-board-tool-body" />
                        </g>
                      </svg>
                    </button>
                    <UnitDots station={station} />
                    <div className="shadow-station-plate">
                      <strong>{item.code}</strong>
                      <small title={item.name}>{item.name}</small>
                    </div>
                    <div className="shadow-station-tag">
                      <span title={tag.main}>{tag.main}</span>
                      {tag.detail && <small>{tag.detail}</small>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {selected && (
            <section
              id="shadow-board-detail"
              ref={detailRef}
              className={`shadow-detail is-${selected.state}`}
              aria-label={`Situação de ${selected.item.name}`}
            >
              <header>
                <div>
                  <small>
                    {selected.item.code} · {selected.item.location || "sem local"}
                  </small>
                  <strong>{selected.item.name}</strong>
                  <span className="shadow-detail-state">
                    <i aria-hidden="true" /> {STATE_LABELS[selected.state]} ·{" "}
                    {selected.state === "maintenance"
                      ? `${selected.total} em reparo`
                      : `${selected.onHook} de ${selected.total} no gancho`}
                  </span>
                </div>
                <button type="button" className="shadow-detail-close" onClick={() => setSelectedId(null)} aria-label="Fechar">
                  <X size={16} />
                </button>
              </header>
              {selected.loans.length ? (
                <ul className="shadow-detail-loans">
                  {selected.loans.map(loan => (
                    <li key={loan.id} className={loan.overdue ? "is-overdue" : undefined}>
                      <div>
                        <strong>{loan.borrowerName}</strong>
                        <small>
                          {formatQuantity(loan.status === "retirado" ? loan.outstanding : loan.quantity, selected.item.unit)} ·{" "}
                          {loan.status === "retirado" ? "retirada" : "reservada, aguardando retirada"}
                          {loan.dueAt ? ` · ${loan.overdue ? "venceu" : "devolve"} ${formatDate(loan.dueAt)}` : ""}
                        </small>
                      </div>
                      {loan.status === "retirado" && (
                        <button type="button" className="fl-button fl-button-secondary" onClick={() => setReturning(loan)}>
                          <Undo2 size={14} aria-hidden="true" /> Devolver
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="fl-muted">
                  {selected.state === "maintenance"
                    ? "Fora de uso até voltar da manutenção. Altere a situação na ficha do item."
                    : "Ninguém está com esta ferramenta agora."}
                </p>
              )}
              <footer>
                {selected.state !== "maintenance" && selected.item.available > 0 && (
                  <button type="button" className="fl-button fl-button-primary" onClick={() => onLoan(selected.item.id)}>
                    Emprestar ({formatQuantity(selected.item.available, selected.item.unit)} livre{selected.item.available === 1 ? "" : "s"})
                  </button>
                )}
                <button type="button" className="fl-button fl-button-secondary" onClick={() => onOpenDetail(selected.item.id)}>
                  Ficha completa <ArrowUpRight size={14} aria-hidden="true" />
                </button>
              </footer>
            </section>
          )}
        </>
      )}

      <ReturnLoanDialog
        loan={returning}
        onClose={() => setReturning(null)}
        onSaved={onNotify}
      />
    </>
  );
}
