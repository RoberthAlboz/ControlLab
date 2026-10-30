import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  Cell,
  LabelList,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from "recharts";

type ActivityType = "aula" | "laboratorio" | "avaliacao";
type ChartView = "bars" | "pie";
type ChartRow = { label: string; detail: string; count: number; color: string };
type TeacherAnalyticsChartsProps = {
  students: Array<{ averageProgress: number }>;
  activities: Array<{ activityType: ActivityType }>;
  /** Cada aba mostra só o gráfico do seu assunto. */
  focus: "progress" | "agenda";
};

type FloatingTooltipProps = TooltipProps<number, string>;

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

function useReducedMotion() {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setReducedMotion(mediaQuery.matches);
    updatePreference();
    mediaQuery.addEventListener("change", updatePreference);
    return () => mediaQuery.removeEventListener("change", updatePreference);
  }, []);

  return reducedMotion;
}

function FloatingTooltip({ active, payload }: FloatingTooltipProps) {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  const row = item.payload as ChartRow | undefined;
  if (!row) return null;

  return (
    <div className="teacher-chart-tooltip">
      <span className="teacher-chart-tooltip-dot" style={{ backgroundColor: row.color }} />
      <div className="teacher-chart-tooltip-copy">
        <strong>{row.label}</strong>
        <small>{row.detail}</small>
      </div>
      <b>{Number(item.value ?? row.count).toLocaleString("pt-BR")}</b>
    </div>
  );
}

function DistributionChartCard({
  title,
  description,
  insight,
  totalLabel,
  totalBadge,
  rows,
  initialView,
  tableCaption,
}: {
  title: string;
  description: string;
  /** Frase com a conclusão do gráfico, mostrada acima dele. */
  insight: string;
  totalLabel: string;
  totalBadge: string;
  rows: ChartRow[];
  initialView: ChartView;
  tableCaption: string;
}) {
  // Cada gráfico tem a forma que melhor lê seus dados; trocar de forma só somava botões.
  const view = initialView;
  const reducedMotion = useReducedMotion();
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  const maxCount = Math.max(1, ...rows.map((row) => row.count));
  const pieRows = rows.filter((row) => row.count > 0);

  // O sr-only fica no invólucro: `overflow` não se aplica a tabelas, que
  // cresceriam até o conteúdo e criariam rolagem horizontal no celular.
  const accessibleTable = (
    <div className="sr-only">
      <table>
        <caption>{tableCaption}</caption>
        <thead>
          <tr>
            <th scope="col">Categoria</th>
            <th scope="col">Detalhe</th>
            <th scope="col">Quantidade</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <td>{row.label}</td>
              <td>{row.detail}</td>
              <td>{row.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <article className="teacher-chart-card">
      <div className="teacher-chart-heading">
        <div>
          <strong>{title}</strong>
          <span>{description}</span>
        </div>
        <span className="teacher-chart-badge">{totalBadge}</span>
      </div>
      <p className="teacher-chart-insight">{insight}</p>

      {view === "bars" ? (
        <div className="teacher-chart-stage" role="img" aria-label={`${title}: ${rows.map((row) => `${row.label}, ${row.count}`).join("; ")}`}>
          <ResponsiveContainer width="100%" height="100%">
            {/* Toda barra tem o valor na ponta, então o eixo X e a grade só fariam ruído. */}
            <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 32, bottom: 4, left: 2 }} barCategoryGap={14}>
              <XAxis type="number" hide domain={[0, maxCount]} allowDecimals={false} />
              <YAxis type="category" dataKey="label" width={104} axisLine={{ stroke: "var(--theme-border-strong)" }} tickLine={false} tick={{ fill: "var(--theme-heading)", fontSize: 12 }} />
              <Tooltip content={<FloatingTooltip />} cursor={{ fill: "var(--theme-surface-soft)" }} />
              <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={18} isAnimationActive={!reducedMotion} animationDuration={650}>
                {rows.map((row) => <Cell key={row.label} fill={row.color} />)}
                <LabelList dataKey="count" position="right" offset={8} fill="var(--theme-heading)" fontSize={11} fontWeight={600} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="teacher-chart-pie-layout">
          <div className="teacher-chart-pie-visual" role="img" aria-label={`${title}: ${rows.map((row) => `${row.label}, ${row.count}`).join("; ")}`}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                {total === 0 ? (
                  // Sem dados: um anel neutro em vez de um espaço vazio.
                  <Pie data={[{ count: 1 }]} dataKey="count" innerRadius="61%" outerRadius="84%" fill="var(--theme-border)" stroke="none" isAnimationActive={false} />
                ) : (
                  <Pie data={pieRows} dataKey="count" nameKey="label" innerRadius="61%" outerRadius="84%" stroke="var(--theme-surface)" strokeWidth={2} isAnimationActive={!reducedMotion} animationDuration={650}>
                    {pieRows.map((row) => <Cell key={row.label} fill={row.color} />)}
                  </Pie>
                )}
                {total > 0 && <Tooltip content={<FloatingTooltip />} />}
              </PieChart>
            </ResponsiveContainer>
            <div className="teacher-chart-pie-center" aria-hidden="true">
              <strong>{total.toLocaleString("pt-BR")}</strong>
              <span>{totalLabel}</span>
            </div>
          </div>
          <ul className="teacher-chart-legend" aria-label={`Legenda de ${title}`}>
            {rows.map((row) => {
              const percentage = total ? Math.round((row.count / total) * 100) : 0;
              return (
                <li key={row.label}>
                  <span className="teacher-chart-legend-dot" style={{ backgroundColor: row.color }} />
                  <span className="teacher-chart-legend-copy"><b>{row.label}</b><small>{row.detail}</small></span>
                  <span className="teacher-chart-legend-value"><b>{row.count}</b><small>{percentage}%</small></span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {accessibleTable}
    </article>
  );
}

export default function TeacherAnalyticsCharts({ students, activities, focus }: TeacherAnalyticsChartsProps) {
  const notStarted = students.filter((student) => student.averageProgress === 0).length;
  const inProgress = students.filter((student) => student.averageProgress > 0 && student.averageProgress < 100).length;
  const completed = students.filter((student) => student.averageProgress >= 100).length;
  const classes = activities.filter((activity) => activity.activityType === "aula").length;
  const labs = activities.filter((activity) => activity.activityType === "laboratorio").length;
  const exams = activities.filter((activity) => activity.activityType === "avaliacao").length;

  const progressGroups: ChartRow[] = [
    // Estados em ordem: rampa de um só tom, do mais fraco ao mais forte.
    { label: "Não iniciado", detail: "0% de progresso", count: notStarted, color: "var(--chart-ord-1)" },
    { label: "Em andamento", detail: "1–99% de progresso", count: inProgress, color: "var(--chart-ord-2)" },
    { label: "Concluído", detail: "100% de progresso", count: completed, color: "var(--chart-ord-3)" },
  ];
  const activityGroups: ChartRow[] = [
    { label: "Aulas", detail: "Conteúdo", count: classes, color: "var(--chart-cat-1)" },
    { label: "Laboratórios", detail: "Prática", count: labs, color: "var(--chart-cat-2)" },
    { label: "Avaliações", detail: "Verificação", count: exams, color: "var(--chart-cat-3)" },
  ];

  const progressInsight = !students.length
    ? "Nenhum aluno cadastrado na turma ainda."
    : completed === students.length
      ? "Toda a turma concluiu os módulos acompanhados."
      : notStarted
        ? `${plural(notStarted, "aluno ainda não começou", "alunos ainda não começaram")}: vale um primeiro contato.`
        : `${plural(inProgress, "aluno está", "alunos estão")} no meio do caminho.`;
  const agendaInsight = !activities.length
    ? "A agenda está vazia: planeje a próxima aula abaixo."
    : exams === 0
      ? "Nenhuma avaliação na agenda ainda."
      : `${plural(exams, "avaliação planejada", "avaliações planejadas")} entre ${plural(activities.length, "atividade", "atividades")}.`;

  return (
    <section className="teacher-analytics is-single" aria-label={focus === "progress" ? "Panorama da turma" : "Panorama da agenda"}>
      <div className="teacher-chart-grid">
        {focus === "progress" ? (
        <DistributionChartCard
          title="Progresso dos alunos"
          description="Distribuição por estado atual"
          insight={progressInsight}
          totalLabel="alunos"
          totalBadge={`${students.length} aluno${students.length === 1 ? "" : "s"}`}
          rows={progressGroups}
          initialView="bars"
          tableCaption="Tabela de distribuição do progresso dos alunos"
        />
        ) : (
        <DistributionChartCard
          title="Agenda planejada"
          description="Atividades por finalidade"
          insight={agendaInsight}
          totalLabel="atividades"
          totalBadge={`${activities.length} atividade${activities.length === 1 ? "" : "s"}`}
          rows={activityGroups}
          initialView="pie"
          tableCaption="Tabela de atividades planejadas por finalidade"
        />
        )}
      </div>
    </section>
  );
}
