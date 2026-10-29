/**
 * Supervisão do estoque (/admin/estoque): visão completa do que entra e sai,
 * por turma e por docente, com alertas de uso indevido. Os docentes operam o
 * estoque; a administração acompanha e aciona o docente responsável.
 *
 * Nada aqui identifica alunos — o acompanhamento é por turma.
 */
import { useState } from "react";
import { AlertTriangle, Mail, ShieldCheck } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { MOVEMENT_TYPE_LABELS } from "@shared/inventory";
import { OVERSIGHT_PERIODS, type OversightPeriod, type OversightPerson } from "@shared/inventory-oversight";
import type { RouterOutputs } from "@/lib/router-types";
import { EmptyBlock, ErrorBlock, formatDateTime, LoadingBlock, MovementChip } from "@/components/inventory/InventoryUI";

type Oversight = RouterOutputs["admin"]["inventory"]["oversight"];
type Alert = Oversight["alerts"][number];

const PERIOD_LABELS: Record<OversightPeriod, string> = { 7: "7 dias", 30: "30 dias", 90: "90 dias", 365: "12 meses" };

/** E-mail já preenchido para a administração acionar o docente. */
function contactHref(teacher: OversightPerson, alert: Alert) {
  const subject = `Estoque: ${alert.title}${alert.classroom ? ` — ${alert.classroom}` : ""}`;
  const body = `Olá, ${teacher.name}.\n\nA supervisão do estoque registrou o seguinte:\n\n${alert.title}\n${alert.detail}\nData: ${formatDateTime(alert.at)}\n\nPode verificar e me retornar?\n`;
  return `mailto:${teacher.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export default function AdminOversightPage() {
  const [days, setDays] = useState<OversightPeriod>(30);
  const query = trpc.admin.inventory.oversight.useQuery({ days }, { staleTime: 30_000, refetchInterval: 60_000 });
  const data = query.data;
  const maxOut = Math.max(1, ...(data?.classrooms ?? []).map(row => row.outQuantity));

  return (
    <main className="clean-content inventory-page admin-oversight">
      <header className="inventory-hero">
        <div>
          <div className="breadcrumb">
            ADMINISTRAÇÃO <span>/</span> SUPERVISÃO DO ESTOQUE
          </div>
          <h1>
            O que entra,
            <br />
            <em>o que sai.</em>
          </h1>
          <p>Consumo por turma e por docente, com alertas de perdas, avarias, atrasos e retiradas fora do padrão. Os docentes operam o estoque; aqui você acompanha e aciona o responsável.</p>
        </div>
        <div className="fl-chip-group" role="group" aria-label="Período analisado">
          {OVERSIGHT_PERIODS.map(option => (
            <button key={option} type="button" className={`fl-button ${days === option ? "fl-button-primary" : "fl-button-secondary"}`} aria-pressed={days === option} onClick={() => setDays(option)}>
              {PERIOD_LABELS[option]}
            </button>
          ))}
        </div>
      </header>

      {query.isLoading ? (
        <LoadingBlock label="Carregando supervisão do estoque…" />
      ) : query.isError || !data ? (
        <ErrorBlock message={query.error?.message} onRetry={() => void query.refetch()} />
      ) : (
        <>
          <section className="inventory-metrics" aria-label="Resumo do período">
            <Metric label="Peças que saíram" value={data.totals.outQuantity} detail="saídas, baixas e retiradas" />
            <Metric label="Peças que entraram" value={data.totals.inQuantity} detail="entradas e ajustes" />
            <Metric label="Perdas e avarias" value={data.totals.lostQuantity} detail="unidades perdidas ou danificadas" alert={data.totals.lostQuantity > 0} />
            <Metric label="Empréstimos" value={data.totals.loansCreated} detail={`${data.totals.activeLoans} em aberto agora`} />
            <Metric label="Atrasados" value={data.totals.overdueLoans} detail="além do prazo de devolução" alert={data.totals.overdueLoans > 0} />
          </section>

          <section className="inventory-panel" aria-labelledby="oversight-alerts-title">
            <div className="inventory-toolbar">
              <h2 id="oversight-alerts-title" className="inventory-section-title">
                Alertas para acionar o docente
              </h2>
              <span className="fl-muted">{data.alerts.length} no período</span>
            </div>
            {data.alerts.length === 0 ? (
              <div className="oversight-ok" role="status">
                <ShieldCheck size={18} aria-hidden="true" /> Nenhuma ocorrência fora do normal neste período.
              </div>
            ) : (
              <ul className="oversight-alerts">
                {data.alerts.map(alert => (
                  <li key={alert.id} className={`is-${alert.severity}`}>
                    <AlertTriangle size={17} aria-hidden="true" />
                    <div>
                      <strong>
                        {alert.title}
                        {alert.classroom && <span className="oversight-tag">{alert.classroom}</span>}
                      </strong>
                      <p>{alert.detail}</p>
                      <small>
                        {formatDateTime(alert.at)}
                        {alert.teacher ? ` · responsável: ${alert.teacher.name}` : " · turma sem docente responsável"}
                        {alert.registeredBy ? ` · registrado por ${alert.registeredBy.name}` : ""}
                      </small>
                    </div>
                    {alert.teacher?.email && (
                      <a className="fl-button fl-button-secondary" href={contactHref(alert.teacher, alert)}>
                        <Mail size={14} aria-hidden="true" /> Acionar
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="inventory-panel" aria-labelledby="oversight-classrooms-title">
            <h2 id="oversight-classrooms-title" className="inventory-section-title">
              Consumo por turma
            </h2>
            {data.classrooms.length === 0 ? (
              <EmptyBlock title="Nenhuma turma cadastrada" description="Cadastre as turmas e os docentes responsáveis na tela Turmas." />
            ) : (
              <div className="fl-table-wrap">
                <table className="fl-table">
                  <thead>
                    <tr>
                      <th>Turma</th>
                      <th>Responsável</th>
                      <th className="num">Peças retiradas</th>
                      <th className="num">Empréstimos</th>
                      <th className="num">Em aberto</th>
                      <th className="num">Atrasados</th>
                      <th className="num">Perdas/avarias</th>
                      <th className="num">Baixas manuais</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.classrooms.map(row => (
                      <tr key={row.id ?? "none"}>
                        <td>
                          <strong>{row.name}</strong>
                          {row.id !== null && <small>{row.students} aluno(s)</small>}
                        </td>
                        <td>
                          {row.teacher ? (
                            <>
                              {row.teacher.name}
                              {row.teacher.email && (
                                <small>
                                  <a href={`mailto:${row.teacher.email}`}>{row.teacher.email}</a>
                                </small>
                              )}
                            </>
                          ) : (
                            <span className="fl-muted">—</span>
                          )}
                        </td>
                        <td className="num">
                          <strong>{row.outQuantity}</strong>
                          <span className="oversight-bar" aria-hidden="true">
                            <i style={{ width: `${(row.outQuantity / maxOut) * 100}%` }} />
                          </span>
                        </td>
                        <td className="num">{row.loans}</td>
                        <td className="num">{row.outstanding}</td>
                        <td className={`num ${row.overdue ? "is-alert" : ""}`}>{row.overdue}</td>
                        <td className={`num ${row.lostQuantity ? "is-alert" : ""}`}>{row.lostQuantity}</td>
                        <td className="num">{row.manualOut}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="inventory-panel" aria-labelledby="oversight-teachers-title">
            <h2 id="oversight-teachers-title" className="inventory-section-title">
              Registros por docente
            </h2>
            {data.teachers.length === 0 ? (
              <EmptyBlock title="Sem registros no período" description="Nenhum docente movimentou o estoque neste período." />
            ) : (
              <div className="fl-table-wrap">
                <table className="fl-table">
                  <thead>
                    <tr>
                      <th>Docente</th>
                      <th>Turmas</th>
                      <th className="num">Movimentações</th>
                      <th className="num">Saídas</th>
                      <th className="num">Entradas</th>
                      <th className="num">Baixas manuais</th>
                      <th className="num">Perdas/avarias</th>
                      <th className="num">Empréstimos</th>
                      <th className="num">Cancelados</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.teachers.map(row => (
                      <tr key={row.id}>
                        <td>
                          <strong>{row.name}</strong>
                          {row.email && (
                            <small>
                              <a href={`mailto:${row.email}`}>{row.email}</a>
                            </small>
                          )}
                        </td>
                        <td>{row.classrooms.length ? row.classrooms.join(", ") : <span className="fl-muted">—</span>}</td>
                        <td className="num">{row.movements}</td>
                        <td className="num">{row.outQuantity}</td>
                        <td className="num">{row.inQuantity}</td>
                        <td className={`num ${row.manualOut ? "is-alert" : ""}`}>{row.manualOut}</td>
                        <td className={`num ${row.lostQuantity ? "is-alert" : ""}`}>{row.lostQuantity}</td>
                        <td className="num">{row.loansCreated}</td>
                        <td className="num">{row.loansCancelled}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <div className="oversight-columns">
            <section className="inventory-panel" aria-labelledby="oversight-items-title">
              <h2 id="oversight-items-title" className="inventory-section-title">
                Itens que mais saem
              </h2>
              {data.topItems.length === 0 ? (
                <EmptyBlock title="Nenhuma saída" description="Nenhum item saiu do estoque neste período." />
              ) : (
                <ol className="inventory-category-list oversight-items">
                  {data.topItems.map(item => (
                    <li key={item.itemId}>
                      <div>
                        <strong>
                          {item.code} · {item.name}
                        </strong>
                        <small>{item.events} saída(s)</small>
                      </div>
                      <strong>
                        {item.outQuantity} {item.unit}
                      </strong>
                    </li>
                  ))}
                </ol>
              )}
            </section>

            <section className="inventory-panel" aria-labelledby="oversight-recent-title">
              <h2 id="oversight-recent-title" className="inventory-section-title">
                Últimas saídas
              </h2>
              {data.recentOut.length === 0 ? (
                <EmptyBlock title="Nenhuma saída" description="Nenhum item saiu do estoque neste período." />
              ) : (
                <div className="fl-table-wrap">
                  <table className="fl-table">
                    <thead>
                      <tr>
                        <th>Quando</th>
                        <th>Item</th>
                        <th>Tipo</th>
                        <th>Turma</th>
                        <th>Docente</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.recentOut.map(movement => (
                        <tr key={movement.id}>
                          <td>{formatDateTime(movement.createdAt)}</td>
                          <td>
                            <strong>
                              {movement.quantity} {movement.unit}
                            </strong>{" "}
                            {movement.itemCode}
                            <small>{movement.itemName}</small>
                          </td>
                          <td>
                            <MovementChip type={movement.type} />
                            <span className="sr-only">{MOVEMENT_TYPE_LABELS[movement.type]}</span>
                          </td>
                          <td>{movement.classroom}</td>
                          <td>{movement.user.name}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        </>
      )}
    </main>
  );
}

function Metric({ label, value, detail, alert }: { label: string; value: number; detail: string; alert?: boolean }) {
  return (
    <div className={`inventory-metric ${alert ? "is-alert" : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}
