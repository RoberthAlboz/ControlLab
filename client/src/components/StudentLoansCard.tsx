import { Wrench } from "lucide-react";
import { trpc } from "@/lib/trpc";
import type { RouterOutputs } from "@/lib/router-types";

type MyLoan = RouterOutputs["learning"]["myLoans"][number];

const dayMonth = (value: Date | string) =>
  new Date(value).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

/** Situação do empréstimo do ponto de vista de quem recebeu a ferramenta. */
function loanState(loan: MyLoan): { tone: "overdue" | "out" | "reserved" | "closed"; label: string } {
  if (loan.status === "reservado") {
    return { tone: loan.overdue ? "overdue" : "reserved", label: "Reservada · retire com o docente" };
  }
  if (loan.status === "retirado") {
    if (loan.overdue && loan.dueAt) return { tone: "overdue", label: `Atrasada · venceu ${dayMonth(loan.dueAt)}` };
    return { tone: "out", label: loan.dueAt ? `Com você · devolva até ${dayMonth(loan.dueAt)}` : "Com você · sem prazo definido" };
  }
  if (loan.status === "cancelado") return { tone: "closed", label: "Reserva cancelada" };
  const when = loan.closedAt ? ` em ${dayMonth(loan.closedAt)}` : "";
  return { tone: "closed", label: loan.damagedQuantity > 0 ? `Devolvida${when} · ${loan.damagedQuantity} com avaria` : `Devolvida${when}` };
}

/** Painel do aluno: ferramentas emprestadas ou reservadas para a própria conta. */
export default function StudentLoansCard() {
  const query = trpc.learning.myLoans.useQuery(undefined, { refetchInterval: 60_000 });
  const loans = query.data ?? [];
  const open = loans.filter(loan => loan.status === "reservado" || loan.status === "retirado");
  const overdue = open.filter(loan => loan.overdue).length;

  return (
    <section className="rc-card rc-loans" aria-labelledby="student-loans-title">
      <div className="rc-head">
        <h2 id="student-loans-title">
          {open.length ? `Suas ferramentas (${open.length})` : "Suas ferramentas"}
        </h2>
        {overdue > 0 && <span className="rc-loans-alert">{overdue} atrasada{overdue > 1 ? "s" : ""}</span>}
      </div>
      {query.isLoading ? (
        <p className="rc-loans-empty">Carregando…</p>
      ) : query.isError ? (
        <p className="rc-loans-empty" role="alert">Não foi possível carregar seus empréstimos.</p>
      ) : !loans.length ? (
        <p className="rc-loans-empty">Nenhuma ferramenta emprestada para você.</p>
      ) : (
        <ul className="rc-loans-list">
          {loans.map(loan => {
            const state = loanState(loan);
            const quantity = loan.status === "retirado" ? loan.outstanding : loan.quantity;
            return (
              <li key={loan.id} className={`rc-loan is-${state.tone}`}>
                <b className="rc-loan-icon" aria-hidden="true">
                  <Wrench size={15} />
                </b>
                <div className="rc-loan-copy">
                  <strong title={loan.itemName}>
                    {loan.itemName}
                    {state.tone !== "closed" && quantity > 1 ? ` × ${quantity}` : ""}
                  </strong>
                  <span className="rc-loan-state">{state.label}</span>
                  {loan.moduleTitle && <span className="rc-loan-meta">{loan.moduleTitle}</span>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
