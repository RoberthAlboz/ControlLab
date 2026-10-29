/**
 * Painel de sombras (5S): cada ferramenta devolvível tem seu lugar pintado no
 * painel. Quando todas as unidades estão fora (emprestadas, reservadas ou em
 * manutenção) só a sombra fica no gancho, com a etiqueta de quem está com ela.
 * Ao registrar a devolução, a ferramenta volta para o gancho balançando.
 */
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { Undo2 } from "lucide-react";
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

type Station = {
  item: InventoryItemRow;
  shape: ToolShape;
  present: boolean;
  out: number;
  loans: InventoryLoanRow[];
  overdue: boolean;
};

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

  const stations = useMemo<Station[]>(() => {
    const loans = loansQuery.data?.loans ?? [];
    return (itemsQuery.data?.items ?? [])
      .filter(item => item.returnable && !item.archived)
      .map(item => {
        const itemLoans = loans.filter(loan => loan.itemId === item.id);
        const out = itemLoans.reduce(
          (sum, loan) =>
            sum +
            (loan.status === "retirado" ? loan.outstanding : loan.quantity),
          0
        );
        return {
          item,
          shape: SHAPES[iconFor(item)],
          present: item.available > 0 && item.status === "disponivel",
          out,
          loans: itemLoans,
          overdue: itemLoans.some(loan => loan.overdue),
        };
      });
  }, [itemsQuery.data, loansQuery.data]);

  // Guarda quem estava no gancho para animar só a volta (não a primeira carga).
  const seen = useRef(new Map<number, boolean>());
  const [returned, setReturned] = useState<Set<number>>(new Set());
  useEffect(() => {
    const back = new Set<number>();
    for (const station of stations) {
      if (seen.current.get(station.item.id) === false && station.present)
        back.add(station.item.id);
      seen.current.set(station.item.id, station.present);
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

  const onBoard = stations.filter(station => station.present).length;

  return (
    <>
      <p className="fl-muted shadow-board-intro">
        <span className="shadow-board-count">
          {onBoard}/{stations.length} no painel
        </span>{" "}
        Cada ferramenta devolvível tem seu contorno no painel, como no 5S.
        Gancho vazio = ferramenta fora, com a etiqueta de quem está com ela. A
        figura de cada uma se escolhe no cadastro do item.
      </p>

      {!stations.length ? (
        <EmptyBlock
          title="Nenhuma ferramenta devolvível"
          description="Itens marcados como devolvíveis aparecem aqui, cada um no seu gancho. Consumíveis ficam só na lista."
        />
      ) : (
        <div
          className={`shadow-board${mounting ? " is-mounting" : ""}`}
          role="list"
        >
          {stations.map((station, index) => {
            const { item, shape, present, out, loans, overdue } = station;
            const holder =
              loans.find(loan => loan.status === "retirado") ?? loans[0];
            const state = present
              ? out > 0
                ? `${out} fora`
                : "No painel"
              : item.status !== "disponivel"
                ? "Em manutenção"
                : holder
                  ? holder.borrowerName
                  : "Sem saldo";
            return (
              <div
                key={item.id}
                role="listitem"
                className={`shadow-station${present ? "" : " is-out"}${returned.has(item.id) ? " is-back" : ""}${overdue ? " is-overdue" : ""}`}
                style={{ "--i": index } as CSSProperties}
              >
                <button
                  type="button"
                  className="shadow-station-hook"
                  onClick={() => onOpenDetail(item.id)}
                  aria-label={`${item.name}: ${present ? `${formatQuantity(item.available, item.unit)} no painel` : `fora do painel (${state})`}. Abrir detalhes`}
                >
                  <svg
                    viewBox="0 0 60 122"
                    aria-hidden="true"
                    focusable="false"
                  >
                    <circle
                      cx="30"
                      cy="7"
                      r="2.6"
                      className="shadow-board-peg"
                    />
                    <ToolSvg shape={shape} className="shadow-board-outline" />
                    <g className="shadow-board-tool">
                      <ToolSvg
                        shape={shape}
                        className="shadow-board-tool-body"
                      />
                    </g>
                  </svg>
                </button>
                <div className="shadow-station-plate">
                  <strong>{item.code}</strong>
                  <small title={item.name}>{item.name}</small>
                </div>
                <div
                  className={`shadow-station-tag${present && !out ? " is-quiet" : ""}`}
                >
                  <span>
                    {overdue ? "Atrasado · " : ""}
                    {state}
                  </span>
                  {!present && holder?.dueAt && (
                    <small>prev. {formatDate(holder.dueAt)}</small>
                  )}
                  {holder?.status === "retirado" ? (
                    <button type="button" onClick={() => setReturning(holder)}>
                      <Undo2 size={12} aria-hidden="true" /> Devolver
                    </button>
                  ) : present && item.status === "disponivel" ? (
                    <button type="button" onClick={() => onLoan(item.id)}>
                      Emprestar
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ReturnLoanDialog
        loan={returning}
        onClose={() => setReturning(null)}
        onSaved={onNotify}
      />
    </>
  );
}
