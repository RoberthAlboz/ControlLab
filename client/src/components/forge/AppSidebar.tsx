import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { LayoutGroup, MotionConfig, motion } from "framer-motion";
import { ArrowRight, BookOpen, Edit3, Grid2X2, LayoutDashboard, LogOut, PanelLeftClose, PanelLeftOpen, Warehouse, X } from "lucide-react";
import BrandLogo from "@/components/forge/BrandLogo";
import BrandMark from "@/components/forge/BrandMark";

/**
 * Menu lateral da área logada (identidade Control Lab).
 * - Desktop: trilho de ícones que se expande ao passar o mouse ou focar pelo
 *   teclado; o botão de fixar mantém aberto (lembrado no navegador) e empurra o conteúdo.
 * - Celular: gaveta com fundo escurecido, controlada pelo botão de menu do header.
 * - Alt+1…5 navega entre os itens visíveis.
 */
export type SidebarView = "dashboard" | "library" | "reader" | "editor" | "inventory";

type NavItem = { view: SidebarView; label: string; hint: string; icon: ReactNode; badge?: number; activeAlso?: string[] };

type AppSidebarProps = {
  view: string;
  isTeacher: boolean;
  open: boolean;
  onClose: () => void;
  onNavigate: (view: SidebarView) => void;
  lowStock: number;
  catalog: { total: number; published: number; averageProgress: number };
  user: { name: string; role: string; initials: string; avatarUrl?: string | null };
  onLogout: () => void;
  loggingOut: boolean;
};

const PIN_KEY = "controllab-sidebar-pinned";

function readPinned() {
  try {
    return localStorage.getItem(PIN_KEY) === "1";
  } catch {
    return false;
  }
}

export default function AppSidebar({ view, isTeacher, open, onClose, onNavigate, lowStock, catalog, user, onLogout, loggingOut }: AppSidebarProps) {
  const [pinned, setPinned] = useState(readPinned);

  const learning: NavItem[] = [
    { view: "dashboard", label: "Início", hint: "Visão geral e anotações", icon: <LayoutDashboard size={18} />, activeAlso: ["notes"] },
    { view: "library", label: "Biblioteca", hint: "Todos os módulos", icon: <BookOpen size={18} /> },
    { view: "reader", label: "Leitor", hint: "Continuar estudando", icon: <Grid2X2 size={18} /> },
  ];
  const teaching: NavItem[] = isTeacher
    ? [
        { view: "editor", label: "Editor", hint: "Criar e editar módulos", icon: <Edit3 size={18} /> },
        { view: "inventory", label: "Estoque", hint: "Ferramentaria", icon: <Warehouse size={18} />, badge: lowStock },
      ]
    : [];
  const shortcuts = [...learning, ...teaching];

  // O conteúdo principal só abre espaço para o menu quando ele está fixado.
  useEffect(() => {
    const root = document.documentElement;
    if (pinned) root.dataset.nav = "pinned";
    else delete root.dataset.nav;
    try {
      localStorage.setItem(PIN_KEY, pinned ? "1" : "0");
    } catch {
      /* navegação privada: o menu só não lembra a escolha */
    }
    return () => {
      delete root.dataset.nav;
    };
  }, [pinned]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (open && event.key === "Escape") {
        onClose();
        return;
      }
      if (!event.altKey || event.ctrlKey || event.metaKey) return;
      const index = Number(event.key) - 1;
      const target = shortcuts[index];
      if (!target) return;
      event.preventDefault();
      onNavigate(target.view);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const isActive = (item: NavItem) => view === item.view || (item.activeAlso?.includes(view) ?? false);
  const progress = Math.max(0, Math.min(100, Math.round(catalog.averageProgress)));

  const renderItem = (item: NavItem) => {
    const active = isActive(item);
    const shortcut = shortcuts.indexOf(item) + 1;
    return (
      <li key={item.view}>
        <button
          type="button"
          className={`cl-nav-item ${active ? "is-active" : ""}`}
          aria-current={active ? "page" : undefined}
          onClick={() => onNavigate(item.view)}
          title={`${item.label} (Alt+${shortcut})`}
        >
          {active && <motion.span layoutId="cl-nav-active" className="cl-nav-active" transition={{ type: "spring", stiffness: 520, damping: 40 }} />}
          <span className="cl-nav-icon" aria-hidden="true">
            {item.icon}
            {item.badge ? <i className="cl-nav-dot" /> : null}
          </span>
          <span className="cl-nav-text">
            <b>{item.label}</b>
            <small>{item.hint}</small>
          </span>
          {item.badge ? (
            <span className="cl-nav-badge" aria-label={`${item.badge} alertas de estoque baixo`}>
              {item.badge}
            </span>
          ) : null}
        </button>
      </li>
    );
  };

  return (
    <MotionConfig reducedMotion="user">
      <aside className={`cl-nav ${open ? "is-open" : ""} ${pinned ? "is-pinned" : ""}`} aria-label="Menu lateral">
        <div className="cl-nav-glow" aria-hidden="true" />

        <div className="cl-nav-top">
          <span className="cl-nav-mark" aria-hidden="true">
            <BrandMark size={38} />
          </span>
          <BrandLogo size="sm" className="cl-nav-logo" />
          <button
            type="button"
            className="cl-nav-pin"
            onClick={() => setPinned(value => !value)}
            aria-pressed={pinned}
            aria-label={pinned ? "Recolher menu" : "Fixar menu aberto"}
            title={pinned ? "Recolher menu" : "Fixar menu aberto"}
          >
            {pinned ? <PanelLeftClose size={17} /> : <PanelLeftOpen size={17} />}
          </button>
          <button type="button" className="cl-nav-close" onClick={onClose} aria-label="Fechar menu">
            <X size={18} />
          </button>
        </div>

        <nav id="primary-navigation" className="cl-nav-sections" aria-label="Navegação principal">
          <LayoutGroup id="cl-nav">
            <p className="cl-nav-label">Aprendizagem</p>
            <ul>{learning.map(renderItem)}</ul>
            {teaching.length > 0 && (
              <>
                <p className="cl-nav-label">Modo docente</p>
                <ul>{teaching.map(renderItem)}</ul>
              </>
            )}
          </LayoutGroup>
        </nav>

        <button type="button" className="cl-nav-catalog" onClick={() => onNavigate("library")}>
          <span className="cl-nav-ring" style={{ "--p": progress } as CSSProperties} aria-hidden="true">
            <b>{progress}%</b>
          </span>
          <span className="cl-nav-text">
            <b>
              {catalog.total} {catalog.total === 1 ? "módulo" : "módulos"}
            </b>
            <small>
              {catalog.published} publicados · progresso médio
            </small>
          </span>
          <ArrowRight size={15} className="cl-nav-catalog-arrow" aria-hidden="true" />
        </button>

        <div className="cl-nav-user">
          <span className="cl-nav-avatar">{user.avatarUrl ? <img src={user.avatarUrl} alt="" /> : user.initials}</span>
          <span className="cl-nav-text">
            <b>{user.name}</b>
            <small>{user.role}</small>
          </span>
          <button type="button" className="cl-nav-logout" onClick={onLogout} disabled={loggingOut} aria-label="Sair da conta" title="Sair">
            <LogOut size={16} />
          </button>
        </div>
      </aside>
      {open && <button type="button" className="cl-nav-backdrop" aria-label="Fechar menu" onClick={onClose} />}
    </MotionConfig>
  );
}
