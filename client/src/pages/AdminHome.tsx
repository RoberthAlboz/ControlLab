/**
 * Início da administração: contas, turmas e estoque da escola em uma tela,
 * mais o calendário escolar só para visualizar (quem agenda são os docentes).
 * Os docentes operam o dia a dia; aqui a administração vê o que precisa de
 * atenção e vai direto à tela onde se resolve.
 *
 * Como na supervisão do estoque, nada aqui acompanha alunos individualmente:
 * os números são por turma e por conta.
 */
import type { ReactNode } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  FileText,
  School,
  ShieldCheck,
  UserRoundX,
  Users,
  UsersRound,
  Warehouse,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import type { InventorySummary } from "@/lib/router-types";

const OVERSIGHT_DAYS = 30;

type TodoItem = {
  id: string;
  tone: "red" | "amber" | "blue";
  icon: ReactNode;
  title: string;
  detail: string;
  action: string;
  onClick: () => void;
};

const plural = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`;

export default function AdminHome({
  adminName,
  inventorySummary,
  calendar,
  onOpenNotes,
  onOpenInventory,
  onOpenOversight,
  onOpenClassrooms,
  onOpenUsers,
}: {
  adminName: string;
  inventorySummary: InventorySummary | null;
  /** Calendário escolar em modo somente leitura. */
  calendar: ReactNode;
  onOpenNotes: () => void;
  onOpenInventory: () => void;
  onOpenOversight: () => void;
  onOpenClassrooms: () => void;
  onOpenUsers: () => void;
}) {
  const usersQuery = trpc.admin.users.list.useQuery(undefined, {
    staleTime: 30_000,
  });
  const classroomsQuery = trpc.admin.classrooms.list.useQuery(undefined, {
    staleTime: 30_000,
  });
  const oversightQuery = trpc.admin.inventory.oversight.useQuery(
    { days: OVERSIGHT_DAYS },
    { staleTime: 30_000, refetchInterval: 60_000 }
  );

  const users = usersQuery.data ?? [];
  const activeUsers = users.filter(user => user.active);
  const teachers = activeUsers.filter(user => user.role === "teacher").length;
  const students = activeUsers.filter(user => user.role === "student");
  const studentsWithoutClassroom = students.filter(
    user => !user.classroomId
  ).length;
  const neverSignedIn = activeUsers.filter(user => !user.lastSignedIn).length;
  const inactiveUsers = users.length - activeUsers.length;

  const classrooms = (classroomsQuery.data ?? []).filter(
    classroom => !classroom.archived
  );
  const classroomsWithoutTeacher = classrooms.filter(
    classroom => !classroom.teacherId
  );

  const oversight = oversightQuery.data;
  const urgentAlerts = (oversight?.alerts ?? []).filter(
    alert => alert.severity === "alta"
  );
  const usageByClassroom = new Map(
    (oversight?.classrooms ?? []).map(row => [row.id, row] as const)
  );
  const stockAlerts = inventorySummary?.alerts ?? [];
  const overdueLoans = inventorySummary?.totals.overdueLoans ?? 0;

  const firstName = adminName.split(" ")[0] || "administração";
  const loading =
    usersQuery.isLoading ||
    classroomsQuery.isLoading ||
    oversightQuery.isLoading;
  const failed = [usersQuery, classroomsQuery, oversightQuery].filter(
    query => query.isError
  );
  // "Para fazer agora": cada item leva à tela onde a ação acontece.
  const todo: TodoItem[] = [
    ...urgentAlerts.slice(0, 3).map(alert => ({
      id: `alert-${alert.id}`,
      tone: "red" as const,
      icon: <AlertTriangle size={16} />,
      title: alert.title,
      detail:
        [
          alert.classroom,
          alert.teacher ? `acionar ${alert.teacher.name}` : null,
        ]
          .filter(Boolean)
          .join(" · ") || alert.detail,
      action: "Ver supervisão",
      onClick: onOpenOversight,
    })),
    // O alerta da supervisão já nomeia cada empréstimo atrasado; o resumo genérico só entra sem ele.
    ...(overdueLoans > 0 && !urgentAlerts.some(alert => alert.kind === "atraso")
      ? [
          {
            id: "loans",
            tone: "red" as const,
            icon: <Warehouse size={16} />,
            title: plural(
              overdueLoans,
              "empréstimo atrasado",
              "empréstimos atrasados"
            ),
            detail: "Ferramentas com devolução vencida.",
            action: "Ver supervisão",
            onClick: onOpenOversight,
          },
        ]
      : []),
    ...(classroomsWithoutTeacher.length
      ? [
          {
            id: "no-teacher",
            tone: "amber" as const,
            icon: <School size={16} />,
            title: plural(
              classroomsWithoutTeacher.length,
              "turma sem docente responsável",
              "turmas sem docente responsável"
            ),
            detail: classroomsWithoutTeacher
              .slice(0, 3)
              .map(classroom => classroom.name)
              .join(", "),
            action: "Abrir turmas",
            onClick: onOpenClassrooms,
          },
        ]
      : []),
    ...(studentsWithoutClassroom
      ? [
          {
            id: "no-classroom",
            tone: "amber" as const,
            icon: <UsersRound size={16} />,
            title: plural(
              studentsWithoutClassroom,
              "aluno sem turma",
              "alunos sem turma"
            ),
            detail:
              "Sem turma, o consumo do estoque não é atribuído a ninguém.",
            action: "Abrir usuários",
            onClick: onOpenUsers,
          },
        ]
      : []),
    ...(stockAlerts.length
      ? [
          {
            id: "stock",
            tone: "amber" as const,
            icon: <Warehouse size={16} />,
            title: plural(
              stockAlerts.length,
              "item com estoque baixo",
              "itens com estoque baixo"
            ),
            detail: stockAlerts
              .slice(0, 3)
              .map(item => item.name)
              .join(", "),
            action: "Abrir estoque",
            onClick: onOpenInventory,
          },
        ]
      : []),
    ...(neverSignedIn
      ? [
          {
            id: "never",
            tone: "blue" as const,
            icon: <UserRoundX size={16} />,
            title: plural(
              neverSignedIn,
              "conta ativa nunca acessou",
              "contas ativas nunca acessaram"
            ),
            detail: "Confira se o login e a senha foram entregues.",
            action: "Abrir usuários",
            onClick: onOpenUsers,
          },
        ]
      : []),
  ];

  return (
    <main className="clean-content teacher-dashboard-content td admin-home">
      <header className="td-hero">
        <div>
          <span className="eyebrow">ADMINISTRAÇÃO</span>
          <h1>Olá, {firstName}.</h1>
          <p>
            O que precisa de atenção em contas, turmas e estoque.
          </p>
        </div>
        <div className="td-hero-actions">
          <button type="button" className="td-btn" onClick={onOpenNotes}>
            <FileText size={15} aria-hidden="true" /> Anotações
          </button>
          <button type="button" className="td-btn" onClick={onOpenOversight}>
            <ShieldCheck size={15} aria-hidden="true" /> Supervisão
          </button>
          <button
            type="button"
            className="td-btn is-primary"
            onClick={onOpenUsers}
          >
            <Users size={15} aria-hidden="true" /> Usuários
          </button>
        </div>
      </header>

      <div
        className="teacher-data-status"
        role={failed.length ? "alert" : "status"}
        aria-live="polite"
      >
        {loading ? (
          "Atualizando dados da administração…"
        ) : failed.length ? (
          <>
            <span>Parte dos dados não carregou.</span>
            <button
              type="button"
              onClick={() => failed.forEach(query => void query.refetch())}
            >
              Tentar novamente
            </button>
          </>
        ) : null}
      </div>

      <section className="td-summary" aria-label="Resumo">
        <button type="button" className="td-stat" onClick={onOpenUsers}>
          <b className="td-stat-icon" aria-hidden="true">
            <Users size={18} />
          </b>
          <span className="td-stat-label">Contas ativas</span>
          <strong>{usersQuery.isError ? "—" : activeUsers.length}</strong>
          <em>
            {teachers} {teachers === 1 ? "docente" : "docentes"} ·{" "}
            {students.length} {students.length === 1 ? "aluno" : "alunos"}
            {inactiveUsers ? ` · ${inactiveUsers} desativada(s)` : ""}
          </em>
        </button>
        <button
          type="button"
          className={`td-stat ${classroomsWithoutTeacher.length ? "has-alert" : ""}`}
          onClick={onOpenClassrooms}
        >
          <b className="td-stat-icon" aria-hidden="true">
            <School size={18} />
          </b>
          <span className="td-stat-label">Turmas ativas</span>
          <strong>{classroomsQuery.isError ? "—" : classrooms.length}</strong>
          <em>
            {classroomsWithoutTeacher.length
              ? `${classroomsWithoutTeacher.length} sem responsável`
              : "todas com responsável"}
          </em>
        </button>
        <button
          type="button"
          className={`td-stat ${stockAlerts.length ? "has-alert" : ""}`}
          onClick={onOpenInventory}
        >
          <b className="td-stat-icon" aria-hidden="true">
            <Warehouse size={18} />
          </b>
          <span className="td-stat-label">Estoque</span>
          <strong>
            {inventorySummary?.totals.items ?? "—"}
            <small> itens</small>
          </strong>
          <em>
            {stockAlerts.length
              ? `${stockAlerts.length} com estoque baixo`
              : `${inventorySummary?.totals.activeLoans ?? 0} empréstimos ativos`}
          </em>
        </button>
        <button
          type="button"
          className={`td-stat ${urgentAlerts.length || overdueLoans ? "has-alert" : ""}`}
          onClick={onOpenOversight}
        >
          <b className="td-stat-icon" aria-hidden="true">
            <ShieldCheck size={18} />
          </b>
          <span className="td-stat-label">Alertas ({OVERSIGHT_DAYS} dias)</span>
          <strong>
            {oversightQuery.isError ? "—" : (oversight?.alerts.length ?? 0)}
          </strong>
          <em>
            {urgentAlerts.length}{" "}
            {urgentAlerts.length === 1 ? "grave" : "graves"} · {overdueLoans}{" "}
            {overdueLoans === 1 ? "atraso" : "atrasos"}
          </em>
        </button>
      </section>

      <section
        id="ah-atencao"
        className="td-section td-todo"
        aria-labelledby="ah-atencao-title"
      >
        <div className="td-section-head">
          <div>
            <span className="eyebrow">PRIORIDADES</span>
            <h2 id="ah-atencao-title">Para fazer agora</h2>
          </div>
        </div>
        {todo.length ? (
          <ul>
            {todo.map(item => (
              <li key={item.id}>
                <button
                  type="button"
                  className={`td-todo-item tone-${item.tone}`}
                  onClick={item.onClick}
                >
                  <b className="td-todo-icon" aria-hidden="true">
                    {item.icon}
                  </b>
                  <span className="td-todo-copy">
                    <strong>{item.title}</strong>
                    <em>{item.detail}</em>
                  </span>
                  <b className="td-todo-action">
                    {item.action} <ArrowRight size={14} aria-hidden="true" />
                  </b>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="td-empty">
            <Check size={16} aria-hidden="true" />{" "}
            {loading
              ? "Verificando pendências…"
              : "Tudo em dia: nenhum alerta grave, turma sem responsável ou conta pendente."}
          </p>
        )}
      </section>

      <section
        id="ah-turmas"
        className="td-section"
        aria-labelledby="ah-turmas-title"
      >
        <div className="td-section-head">
          <div>
            <span className="eyebrow">TURMAS</span>
            <h2 id="ah-turmas-title">Turmas e responsáveis</h2>
            <p>
              Consumo do estoque nos últimos {OVERSIGHT_DAYS} dias, por turma.
            </p>
          </div>
          <button type="button" className="td-link" onClick={onOpenClassrooms}>
            Gerenciar turmas <ArrowRight size={14} aria-hidden="true" />
          </button>
        </div>
        {classroomsQuery.isLoading ? (
          <p className="td-empty">Carregando turmas…</p>
        ) : !classrooms.length ? (
          <p className="td-empty">
            Nenhuma turma ativa.{" "}
            <button
              type="button"
              className="td-link"
              onClick={onOpenClassrooms}
            >
              Cadastrar turma
            </button>
          </p>
        ) : (
          <div className="fl-table-wrap">
            <table className="fl-table">
              <thead>
                <tr>
                  <th scope="col">Turma</th>
                  <th scope="col">Responsável</th>
                  <th scope="col" className="num">
                    Alunos
                  </th>
                  <th scope="col" className="num">
                    Saídas
                  </th>
                  <th scope="col" className="num">
                    Em aberto
                  </th>
                </tr>
              </thead>
              <tbody>
                {classrooms.map(classroom => {
                  const usage = usageByClassroom.get(classroom.id);
                  return (
                    <tr key={classroom.id}>
                      <td data-label="Turma">
                        <strong>{classroom.name}</strong>
                      </td>
                      <td data-label="Responsável">
                        {classroom.teacherName ?? (
                          <span className="admin-home-missing">
                            Sem responsável
                          </span>
                        )}
                      </td>
                      <td data-label="Alunos" className="num">
                        {classroom.students}
                      </td>
                      <td data-label="Saídas" className="num">
                        {usage?.outQuantity ?? 0}
                      </td>
                      <td data-label="Em aberto" className="num">
                        {usage?.outstanding ?? 0}
                        {usage?.overdue ? (
                          <small className="admin-home-missing">
                            {usage.overdue} atrasado(s)
                          </small>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section
        id="ah-calendario"
        className="td-section"
        aria-label="Calendário escolar"
      >
        {calendar}
      </section>
    </main>
  );
}
