import { AlertTriangle, ArrowRight, Warehouse } from "lucide-react";
import type { InventorySummary } from "@/lib/router-types";
import { formatQuantity } from "./InventoryUI";

/**
 * Cartão do dashboard docente: números vindos de `inventory.summary` (banco).
 * Nada é estimado no cliente.
 */
export default function TeacherStockPanel({
  summary,
  loading,
  error,
  onOpen,
}: {
  summary: InventorySummary | null;
  loading: boolean;
  error: boolean;
  onOpen: () => void;
}) {
  return (
    <section className="teacher-stock-panel" aria-labelledby="teacher-stock-title">
      <div className="teacher-stock-head">
        <div>
          <span className="eyebrow">ESTOQUE DA FERRAMENTARIA</span>
          <h2 id="teacher-stock-title">Ferramentas e materiais</h2>
        </div>
        <button type="button" className="fl-button fl-button-secondary" onClick={onOpen}>
          <Warehouse size={15} aria-hidden="true" /> Abrir estoque <ArrowRight size={14} aria-hidden="true" />
        </button>
      </div>
      {loading ? (
        <p className="fl-muted" role="status">
          Carregando resumo do estoque…
        </p>
      ) : error || !summary ? (
        <p className="fl-muted" role="alert">
          Não foi possível carregar o resumo do estoque agora.
        </p>
      ) : (
        <>
          <div className="teacher-stock-metrics">
            <div>
              <span>Itens ativos</span>
              <strong>{summary.totals.items}</strong>
            </div>
            <div>
              <span>Disponíveis</span>
              <strong>{summary.totals.available}</strong>
            </div>
            <div className={summary.totals.lowStock ? "is-alert" : ""}>
              <span>Estoque baixo</span>
              <strong>{summary.totals.lowStock}</strong>
            </div>
            <div>
              <span>Empréstimos ativos</span>
              <strong>{summary.totals.activeLoans}</strong>
              {summary.totals.overdueLoans > 0 && <small className="is-alert">{summary.totals.overdueLoans} atrasado(s)</small>}
            </div>
          </div>
          {summary.alerts.length > 0 && (
            <ul className="teacher-stock-alerts">
              {summary.alerts.slice(0, 3).map(alert => (
                <li key={alert.id}>
                  <AlertTriangle size={14} aria-hidden="true" />
                  <span>
                    <b>{alert.code}</b> {alert.name}
                  </span>
                  <small>
                    {formatQuantity(alert.available, alert.unit)} disp. · mín. {alert.minQuantity}
                  </small>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
