import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Bell, BookOpen, CalendarClock, Check, CheckCheck, FilePen, PartyPopper, PlayCircle, Sparkles, Warehouse } from "lucide-react";

/**
 * Central de notificações do header. As notificações são derivadas dos dados
 * reais (estoque, empréstimos, rascunhos, agenda, progresso); o estado de
 * leitura fica no navegador, por usuário. O id de cada notificação inclui o
 * valor que a gerou, então uma mudança (ex.: saldo caiu de novo) volta a avisar.
 */
export type NotificationKind = "stock" | "loan" | "draft" | "class" | "progress" | "done" | "new";

export type AppNotification = {
  id: string;
  kind: NotificationKind;
  title: string;
  detail: string;
  /** Momento associado (aula, etc.). Sem data, a notificação é "agora". */
  when?: Date | null;
  urgent?: boolean;
  target: { view: "dashboard" | "library" | "reader" | "editor" | "inventory" | "notes"; moduleId?: string; stepIndex?: number };
};

type NotificationCenterProps = {
  items: AppNotification[];
  storageKey: string;
  onOpen: (item: AppNotification) => void;
};

const ICONS: Record<NotificationKind, ReactNode> = {
  stock: <Warehouse size={16} />,
  loan: <AlertTriangle size={16} />,
  draft: <FilePen size={16} />,
  class: <CalendarClock size={16} />,
  progress: <PlayCircle size={16} />,
  done: <PartyPopper size={16} />,
  new: <Sparkles size={16} />,
};

const SECTION: Record<NotificationKind, string> = {
  stock: "Estoque",
  loan: "Estoque",
  draft: "Conteúdo",
  class: "Agenda",
  progress: "Estudos",
  done: "Estudos",
  new: "Conteúdo",
};

function readIds(key: string) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : [];
  } catch {
    return [];
  }
}

export function relativeWhen(when: Date | null | undefined, now = new Date()) {
  if (!when) return "agora";
  const minutes = Math.round((when.getTime() - now.getTime()) / 60_000);
  const time = when.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  if (minutes < -60 * 24) return when.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
  if (minutes < 0) return "em andamento";
  if (minutes < 60) return `em ${Math.max(1, minutes)} min`;
  const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const days = Math.round((startOfDay(when) - startOfDay(now)) / 86_400_000);
  if (days === 0) return `hoje, ${time}`;
  if (days === 1) return `amanhã, ${time}`;
  return `${when.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "")}, ${time}`;
}

export default function NotificationCenter({ items, storageKey, onOpen }: NotificationCenterProps) {
  const [open, setOpen] = useState(false);
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [read, setRead] = useState<string[]>(() => readIds(storageKey));
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => setRead(readIds(storageKey)), [storageKey]);

  const persist = (next: string[]) => {
    // Guarda só ids que ainda existem, para a lista não crescer para sempre.
    const live = new Set(items.map(item => item.id));
    const kept = next.filter(id => live.has(id));
    setRead(kept);
    try {
      localStorage.setItem(storageKey, JSON.stringify(kept));
    } catch {
      /* armazenamento opcional */
    }
  };

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (event.target instanceof Node && !wrapRef.current?.contains(event.target)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const unread = items.filter(item => !read.includes(item.id));
  const visible = onlyUnread ? unread : items;
  const groups = useMemo(() => {
    const map = new Map<string, AppNotification[]>();
    for (const item of visible) {
      const section = item.urgent ? "Precisa de atenção" : SECTION[item.kind];
      map.set(section, [...(map.get(section) ?? []), item]);
    }
    return Array.from(map.entries());
  }, [visible]);

  return (
    <div className="cl-notif" ref={wrapRef}>
      <button
        ref={triggerRef}
        type="button"
        className={`cl-header-icon cl-notif-trigger ${unread.length ? "has-unread" : ""}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={unread.length ? `Notificações: ${unread.length} não lidas` : "Notificações"}
        title="Notificações"
        onClick={() => setOpen(value => !value)}
      >
        <Bell size={18} />
        {unread.length > 0 && <span className="cl-notif-count">{unread.length > 9 ? "9+" : unread.length}</span>}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            className="cl-notif-panel"
            role="dialog"
            aria-label="Notificações"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.16, ease: [0.2, 0.8, 0.2, 1] }}
          >
            <header className="cl-notif-head">
              <div>
                <strong>Notificações</strong>
                <span>{unread.length ? `${unread.length} não ${unread.length === 1 ? "lida" : "lidas"}` : "Tudo em dia"}</span>
              </div>
              <button type="button" className="cl-notif-readall" onClick={() => persist(items.map(item => item.id))} disabled={!unread.length}>
                <CheckCheck size={15} /> Marcar todas
              </button>
            </header>

            <div className="cl-notif-tabs" role="tablist" aria-label="Filtrar notificações">
              <button type="button" role="tab" aria-selected={!onlyUnread} onClick={() => setOnlyUnread(false)}>
                Todas <i>{items.length}</i>
              </button>
              <button type="button" role="tab" aria-selected={onlyUnread} onClick={() => setOnlyUnread(true)}>
                Não lidas <i>{unread.length}</i>
              </button>
            </div>

            <div className="cl-notif-body">
              {groups.length === 0 ? (
                <div className="cl-notif-empty">
                  <span>
                    <Check size={20} />
                  </span>
                  <b>{onlyUnread ? "Nenhuma notificação nova" : "Nada por aqui"}</b>
                  <small>Avisos de estoque, agenda e estudos aparecem aqui assim que acontecerem.</small>
                </div>
              ) : (
                groups.map(([section, list]) => (
                  <section key={section} className="cl-notif-group">
                    <h3>{section}</h3>
                    <ul>
                      {list.map(item => {
                        const isUnread = !read.includes(item.id);
                        return (
                          <li key={item.id}>
                            <button
                              type="button"
                              className={`cl-notif-item kind-${item.kind} ${item.urgent ? "is-urgent" : ""} ${isUnread ? "is-unread" : ""}`}
                              onClick={() => {
                                persist([...read, item.id]);
                                setOpen(false);
                                onOpen(item);
                              }}
                            >
                              <span className="cl-notif-icon" aria-hidden="true">
                                {ICONS[item.kind]}
                              </span>
                              <span className="cl-notif-copy">
                                <b>{item.title}</b>
                                <small>{item.detail}</small>
                              </span>
                              <span className="cl-notif-meta">
                                <time>{relativeWhen(item.when)}</time>
                                {isUnread && <i className="cl-notif-unread" aria-label="não lida" />}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                ))
              )}
            </div>

            <footer className="cl-notif-foot">
              <BookOpen size={13} aria-hidden="true" /> Atualizadas automaticamente a partir do sistema
            </footer>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
