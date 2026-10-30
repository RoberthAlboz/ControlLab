import { BookOpen, Plus, Search, X } from "lucide-react";
import { type DidacticModule, ModuleCard } from "./shared";
import {
  countModulesByKind,
  filterLibraryModules,
  type KindFilter,
  libraryEmptyDescription,
  libraryKindOptions,
  libraryResultText,
} from "./logic";

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
              aria-label={`${kind}: ${kindCounts[kind]} ${kindCounts[kind] === 1 ? "módulo" : "módulos"}`}
              key={kind}
              onClick={() => onKindFilterChange(kind)}
            >
              <span>{kind}</span>
              <span className="library-tab-count" aria-hidden="true">
                {kindCounts[kind]}
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
