import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import StampMark from "@/components/forge/StampMark";

export type CompletionCelebration = { title: string; code: string };

/** Carimbo de "módulo concluído"; some sozinho depois de alguns segundos. */
export function CompletionOverlay({
  celebration,
  onClose,
}: {
  celebration: CompletionCelebration | null;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!celebration) return;
    const timeout = window.setTimeout(onClose, 3600);
    return () => window.clearTimeout(timeout);
  }, [celebration]);
  return (
    <AnimatePresence>
      {celebration && (
        <motion.div
          className="completion-overlay"
          role="status"
          aria-live="polite"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="completion-island"
            initial={{ opacity: 0, y: 18, scale: 0.82 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.94 }}
            transition={{ type: "spring", stiffness: 360, damping: 24 }}
            onClick={event => event.stopPropagation()}
          >
            <StampMark />
            <span className="eyebrow">{celebration.code}</span>
            <h2>Módulo concluído</h2>
            <p>{celebration.title}</p>
            <div className="completion-progress">
              <span />
            </div>
            <small>Progresso salvo no banco de dados.</small>
            <button type="button" onClick={onClose}>
              Continuar estudando <ArrowRight size={14} />
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
