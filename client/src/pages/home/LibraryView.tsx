import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Clock,
  FileText,
  Gauge,
  Globe2,
  Layers3,
  Play,
  Plus,
  Search,
  X,
} from "lucide-react";
import type { ReactNode } from "react";
import { type DidacticModule, ModuleCard } from "./shared";
import {
  countModulesByKind,
  filterLibraryModules,
  type KindFilter,
  libraryEmptyDescription,
  libraryKindOptions,
  libraryResultText,
} from "./logic";

/** Soma "45 min", "1h 20" etc.; devolve "—" quando nenhuma duração tem número. */
function totalDuration(modules: DidacticModule[]) {
  let minutes = 0;
  for (const item of modules) {
    const hours = /(\d+)\s*h/i.exec(item.duration);
    const mins = /(\d+)\s*min/i.exec(item.duration) ?? /h\s*(\d+)/i.exec(item.duration);
    minutes += (hours ? Number(hours[1]) * 60 : 0) + (mins ? Number(mins[1]) : 0);
  }
  if (!minutes) return "—";
  return minutes >= 60 ? `${Math.floor(minutes / 60)}h${minutes % 60 ? `${String(minutes % 60).padStart(2, "0")}` : ""}` : `${minutes} min`;
}

function Kpi({ icon, value, label }: { icon: ReactNode; value: string | number; label: string }) {
  return (
    <div className="lib-kpi">
      <span className="lib-kpi-icon" aria-hidden="true">
        {icon}
      </span>
      <b>{value}</b>
      <span className="lib-kpi-label">{label}</span>
    </div>
  );
}

/** Biblioteca de módulos: filtro por tipo, busca sem acento e grade de cartões. */
export function LibraryView({
  modules,
  canEdit,
  search,
  onSearchChange,
  kindFilter,
  onKindFilterChange,
  onOpen,
  onEdit,
  onDelete,
  onNew,
}: {
  modules: DidacticModule[];
  canEdit: boolean;
  search: string;
  onSearchChange: (value: string) => void;
  kindFilter: KindFilter;
  onKindFilterChange: (kind: KindFilter) => void;
  onOpen: (module: DidacticModule) => void;
  onEdit: (module: DidacticModule) => void;
  onDelete: (module: DidacticModule) => void;
  onNew: () => void;
}) {
  const visibleModules = filterLibraryModules(modules, kindFilter, search);
  const kindOptions = libraryKindOptions(modules);
  const kindCounts = countModulesByKind(modules, kindOptions);
  const hasFilters = kindFilter !== "Todos" || Boolean(search.trim());
  // Resumo e atalho: só leitura, calculados dos mesmos dados dos cartões.
  const inProgress = modules.filter(item => item.progress > 0 && item.progress < 100);
  const completed = modules.filter(item => item.progress >= 100);
  const averageProgress = modules.length
    ? Math.round(modules.reduce((sum, item) => sum + (item.progress || 0), 0) / modules.length)
    : 0;
  const published = modules.filter(item => item.published).length;
  const totalSteps = modules.reduce((sum, item) => sum + item.steps.length, 0);
  const featured = canEdit ? undefined : (inProgress[0] ?? modules.find(item => item.progress <= 0));
  const featuredProgress = featured ? Math.max(0, Math.min(100, Math.round(featured.progress || 0))) : 0;
  const featuredVerb = featured && featured.progress > 0 ? "Continuar" : "Começar";
  const clearFilters = () => {
    onKindFilterChange("Todos");
    onSearchChange("");
  };
  return (
    <main className="clean-content library-content">
      <div className="library-hero">
        <span className="library-hero-pulse" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <div>
          <div className="breadcrumb">
            CONTROL LAB <span>/</span> MÓDULOS
          </div>
          <h1>
            Módulos de
            <br />
            <em>ferramentaria.</em>
          </h1>
          <p>
            Aulas organizadas por ferramenta, montagem e processo, com etapas,
            objetivos e recursos de apoio.
          </p>
        </div>
        <div className="library-stat">
          <BookOpen size={25} />
          <b>{modules.length}</b>
          <span>
            {modules.length === 1
              ? "módulo no catálogo"
              : "módulos no catálogo"}
          </span>
        </div>
      </div>
      {modules.length > 0 && (
        <section className="lib-kpis" aria-label="Resumo dos módulos">
          {canEdit ? (
            <>
              <Kpi icon={<Globe2 size={18} />} value={published} label="Publicados" />
              <Kpi icon={<FileText size={18} />} value={modules.length - published} label="Rascunhos" />
              <Kpi icon={<Layers3 size={18} />} value={totalSteps} label="Etapas no total" />
              <Kpi icon={<Clock size={18} />} value={totalDuration(modules)} label="Duração total" />
            </>
          ) : (
            <>
              <Kpi icon={<Play size={18} />} value={inProgress.length} label="Em andamento" />
              <Kpi icon={<CheckCircle2 size={18} />} value={completed.length} label="Concluídos" />
              <Kpi icon={<Gauge size={18} />} value={`${averageProgress}%`} label="Progresso médio" />
              <Kpi icon={<Clock size={18} />} value={totalDuration(modules)} label="Duração total" />
            </>
          )}
        </section>
      )}
      {featured && !hasFilters && (
        <section className="lib-feature" aria-label="Continuar estudando">
          <div className="lib-feature-copy">
            <span className="lib-feature-kicker">{featured.progress > 0 ? "Continue de onde parou" : "Comece por aqui"}</span>
            <h2>{featured.title}</h2>
            <p>
              {featured.code} · {featured.kind} · {featured.duration} · {featured.steps.length}{" "}
              {featured.steps.length === 1 ? "etapa" : "etapas"}
            </p>
          </div>
          <div className="lib-feature-progress">
            <span>{featuredProgress}% concluído</span>
            <i aria-hidden="true">
              <em style={{ width: `${featuredProgress}%` }} />
            </i>
          </div>
          <button
            type="button"
            className="lib-feature-cta"
            onClick={() => onOpen(featured)}
            aria-label={`${featuredVerb} módulo ${featured.title}`}
          >
            {featuredVerb} <ArrowRight size={16} aria-hidden="true" />
          </button>
        </section>
      )}
      <div className="library-toolbar">
        <div
          className="library-tabs"
          role="group"
          aria-label="Filtrar módulos por tipo"
        >
          {kindOptions.map(kind => (
            <button
              type="button"
              className={kindFilter === kind ? "selected" : ""}
              aria-pressed={kindFilter === kind}
              disabled={kindCounts[kind] === 0 && kindFilter !== kind}
              key={kind}
              onClick={() => onKindFilterChange(kind)}
            >
              <span>{kind}</span>{" "}
              <span className="library-tab-count">{kindCounts[kind]}</span>
              <span className="sr-only">
                {kindCounts[kind] === 1 ? " módulo" : " módulos"}
              </span>
            </button>
          ))}
        </div>
        <label className="search-box">
          <Search size={16} />
          <input
            aria-label="Buscar módulo"
            value={search}
            onChange={e => onSearchChange(e.target.value)}
            placeholder="Buscar módulo"
          />
          {search && (
            <button
              type="button"
              className="clear-search"
              aria-label="Limpar busca"
              onClick={() => onSearchChange("")}
            >
              <X size={13} />
            </button>
          )}
        </label>
        {canEdit && (
          <button className="new-module-button" onClick={onNew}>
            <Plus size={15} /> Novo módulo
          </button>
        )}
      </div>
      <div className="library-results-bar">
        {/* Sem filtro, o total já está no banner: a contagem só volta ao filtrar. */}
        <span role="status" aria-live="polite">
          {hasFilters ? libraryResultText(visibleModules.length, true) : ""}
        </span>
        {hasFilters && visibleModules.length > 0 && (
          <button
            type="button"
            className="library-clear-filters"
            onClick={clearFilters}
          >
            Limpar filtros <X size={13} />
          </button>
        )}
      </div>
      {visibleModules.length > 0 ? (
        <div className="module-grid">
          {visibleModules.map(module => (
            <ModuleCard
              key={module.id}
              module={module}
              canEdit={canEdit}
              onOpen={() => onOpen(module)}
              onEdit={() => onEdit(module)}
              onDelete={() => onDelete(module)}
            />
          ))}
        </div>
      ) : (
        <section
          className="module-empty-state"
          role="status"
          aria-live="polite"
        >
          <div className="module-empty-icon" aria-hidden="true">
            <Search size={20} />
          </div>
          <h2>
            {modules.length === 0
              ? "Nenhum módulo no catálogo"
              : "Nenhum módulo encontrado"}
          </h2>
          <p>{libraryEmptyDescription(modules.length, search, kindFilter)}</p>
          {hasFilters && (
            <button
              type="button"
              className="library-empty-reset"
              onClick={clearFilters}
            >
              Limpar busca e filtros
            </button>
          )}
        </section>
      )}
    </main>
  );
}
