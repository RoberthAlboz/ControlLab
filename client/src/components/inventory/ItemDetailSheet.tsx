import { ArchiveRestore, Archive, ArrowLeftRight, BookOpen, HandHelping, Pencil } from "lucide-react";
import { trpc } from "@/lib/trpc";
import {
  ITEM_CONSERVATION_LABELS,
  ITEM_STATUS_LABELS,
  ITEM_TYPE_LABELS,
  MOVEMENT_REASON_LABELS,
} from "@shared/inventory";
import type { InventoryItemRow } from "@/lib/router-types";
import { EmptyBlock, ErrorBlock, formatDate, formatDateTime, formatQuantity, HealthChip, LoadingBlock, LoanStatusChip, Modal, MovementChip, movementSign } from "./InventoryUI";

const AUDIT_LABELS: Record<string, string> = {
  create: "Cadastro criado",
  update: "Cadastro alterado",
  archive: "Item arquivado",
  restore: "Item restaurado",
};

const FIELD_LABELS: Record<string, string> = {
  code: "código",
  sapCode: "SAP",
  name: "descrição",
  description: "observações",
  itemType: "tipo",
  categoryId: "categoria",
  unit: "unidade",
  returnable: "controle",
  minQuantity: "mínimo",
  sector: "setor",
  location: "localização",
  conservation: "conservação",
  status: "disponibilidade",
};

function describeChanges(changes: unknown) {
  if (!changes || typeof changes !== "object") return "";
  const after = (changes as { after?: Record<string, unknown> }).after;
  if (after) return `Campos: ${Object.keys(after).map(key => FIELD_LABELS[key] ?? key).join(", ")}`;
  const reason = (changes as { reason?: string }).reason;
  return reason ? `Motivo: ${reason}` : "";
}

export default function ItemDetailSheet({
  itemId,
  onClose,
  onEdit,
  onMove,
  onLoan,
  onArchive,
  onRestore,
  onOpenModule,
}: {
  itemId: number | null;
  onClose: () => void;
  onEdit: (item: InventoryItemRow) => void;
  onMove: (itemId: number) => void;
  onLoan: (itemId: number) => void;
  onArchive: (item: InventoryItemRow) => void;
  onRestore: (item: InventoryItemRow) => void;
  onOpenModule: (moduleId: string) => void;
}) {
  const detailQuery = trpc.inventory.items.detail.useQuery({ id: itemId ?? 0 }, { enabled: itemId != null });
  const detail = detailQuery.data;
  const item = detail?.item;

  return (
    <Modal open={itemId != null} onOpenChange={open => !open && onClose()} variant="sheet" size="lg" title={item ? item.name : "Detalhes do item"} description={item ? `${item.code}${item.sapCode ? ` · SAP ${item.sapCode}` : ""}` : undefined}>
      {detailQuery.isLoading ? (
        <LoadingBlock label="Carregando item…" />
      ) : detailQuery.isError || !detail || !item ? (
        <ErrorBlock message={detailQuery.error?.message} onRetry={() => void detailQuery.refetch()} />
      ) : (
        <div className="fl-detail">
          <div className="fl-detail-actions">
            {!item.archived ? (
              <>
                <button type="button" className="fl-button fl-button-primary" onClick={() => onMove(item.id)}>
                  <ArrowLeftRight size={15} aria-hidden="true" /> Movimentar
                </button>
                {item.returnable && (
                  <button type="button" className="fl-button fl-button-secondary" onClick={() => onLoan(item.id)} disabled={item.available < 1 || item.status !== "disponivel"}>
                    <HandHelping size={15} aria-hidden="true" /> Emprestar
                  </button>
                )}
                <button type="button" className="fl-button fl-button-secondary" onClick={() => onEdit(item)}>
                  <Pencil size={15} aria-hidden="true" /> Editar
                </button>
                <button type="button" className="fl-button fl-button-quiet danger" onClick={() => onArchive(item)}>
                  <Archive size={15} aria-hidden="true" /> Arquivar
                </button>
              </>
            ) : (
              <button type="button" className="fl-button fl-button-secondary" onClick={() => onRestore(item)}>
                <ArchiveRestore size={15} aria-hidden="true" /> Restaurar item
              </button>
            )}
          </div>

          {item.archived && (
            <div className="fl-alert is-warning" role="status">
              Arquivado em {formatDate(item.archivedAt)} — {item.archiveReason}. O histórico e os vínculos com módulos foram preservados.
            </div>
          )}

          <div className="fl-facts">
            <div>
              <span>Disponível</span>
              <strong>{formatQuantity(item.available, item.unit)}</strong>
            </div>
            <div>
              <span>Físico</span>
              <strong>{formatQuantity(item.quantityPhysical, item.unit)}</strong>
            </div>
            <div>
              <span>Reservado</span>
              <strong>{formatQuantity(item.quantityReserved, item.unit)}</strong>
            </div>
            <div>
              <span>Mínimo</span>
              <strong>{item.minQuantity ? formatQuantity(item.minQuantity, item.unit) : "—"}</strong>
            </div>
          </div>

          <dl className="fl-dl">
            <dt>Situação</dt>
            <dd>
              <HealthChip health={item.health} />
            </dd>
            <dt>Tipo</dt>
            <dd>
              {ITEM_TYPE_LABELS[item.itemType]} · {item.returnable ? "devolvível" : "consumível"}
            </dd>
            <dt>Categoria</dt>
            <dd>{item.categoryName ?? "Sem categoria"}</dd>
            <dt>Localização</dt>
            <dd>
              {item.sector} · {item.location}
            </dd>
            <dt>Conservação</dt>
            <dd>{ITEM_CONSERVATION_LABELS[item.conservation]}</dd>
            <dt>Disponibilidade</dt>
            <dd>{ITEM_STATUS_LABELS[item.status]}</dd>
            {item.description && (
              <>
                <dt>Observações</dt>
                <dd>{item.description}</dd>
              </>
            )}
          </dl>

          <section className="fl-detail-section">
            <h3>Usado nos módulos</h3>
            {detail.usedIn.length ? (
              <ul className="fl-link-list">
                {detail.usedIn.map(use => (
                  <li key={`${use.moduleId}-${use.resourceTitle}`}>
                    <button type="button" onClick={() => onOpenModule(use.moduleId)}>
                      <BookOpen size={14} aria-hidden="true" />
                      <span>
                        <b>
                          {use.moduleCode} · {use.moduleTitle}
                        </b>
                        <small>
                          Recurso “{use.resourceTitle}” · {use.published ? "publicado" : "rascunho"}
                        </small>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="fl-muted">Nenhum módulo usa este item. Vincule-o no editor docente, em “Recursos técnicos”.</p>
            )}
          </section>

          <section className="fl-detail-section">
            <h3>Empréstimos em andamento</h3>
            {detail.activeLoans.length ? (
              <ul className="fl-simple-list">
                {detail.activeLoans.map(loan => (
                  <li key={loan.id}>
                    <span>
                      #{loan.id} · {loan.borrowerName} · {formatQuantity(loan.quantity - loan.returnedQuantity - loan.damagedQuantity, item.unit)}
                    </span>
                    <LoanStatusChip status={loan.status} overdue={loan.status === "retirado" && loan.dueAt != null && new Date(loan.dueAt).getTime() < Date.now()} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="fl-muted">Nenhum empréstimo ativo.</p>
            )}
          </section>

          <section className="fl-detail-section">
            <h3>Histórico de movimentações</h3>
            {detail.movements.length ? (
              <ol className="fl-timeline">
                {detail.movements.map(movement => (
                  <li key={movement.id}>
                    <div className="fl-timeline-head">
                      <MovementChip type={movement.movementType} />
                      <strong>
                        {movementSign(movement.movementType)}
                        {formatQuantity(movement.quantity, movement.unitSnapshot)}
                      </strong>
                      <time>{formatDateTime(movement.createdAt)}</time>
                    </div>
                    <small>
                      {MOVEMENT_REASON_LABELS[movement.reason]} · físico {movement.physicalBefore} → {movement.physicalAfter} · reservado {movement.reservedBefore} → {movement.reservedAfter}
                    </small>
                    <small>
                      {movement.userName ?? "—"}
                      {movement.reference ? ` · ${movement.reference}` : ""}
                      {movement.moduleTitleSnapshot ? ` · ${movement.moduleTitleSnapshot}` : ""}
                    </small>
                    {movement.note && <p>{movement.note}</p>}
                  </li>
                ))}
              </ol>
            ) : (
              <EmptyBlock title="Sem movimentações" description="As entradas e saídas deste item aparecerão aqui." />
            )}
          </section>

          <section className="fl-detail-section">
            <h3>Alterações de cadastro</h3>
            {detail.audit.length ? (
              <ul className="fl-simple-list">
                {detail.audit.map(entry => (
                  <li key={entry.id}>
                    <span>
                      <b>{AUDIT_LABELS[entry.action] ?? entry.action}</b> · {entry.userName ?? "—"}
                      <small>{describeChanges(entry.changes)}</small>
                    </span>
                    <time>{formatDateTime(entry.createdAt)}</time>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="fl-muted">Sem alterações registradas.</p>
            )}
          </section>
        </div>
      )}
    </Modal>
  );
}
