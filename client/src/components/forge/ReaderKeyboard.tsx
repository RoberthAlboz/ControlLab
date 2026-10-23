import { useEffect } from "react";

/**
 * Atalhos do leitor: ← etapa anterior, → próxima etapa liberada.
 * Ignora as teclas enquanto o foco está num campo de texto ou com modificadores.
 */
export default function ReaderKeyboard({ onPrevious, onNext }: { onPrevious?: () => void; onNext?: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      const target = event.target;
      if (target instanceof Element && target.closest("input, textarea, select, [contenteditable='true']")) return;
      if (event.key === "ArrowLeft" && onPrevious) {
        event.preventDefault();
        onPrevious();
      } else if (event.key === "ArrowRight" && onNext) {
        event.preventDefault();
        onNext();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onPrevious, onNext]);
  return null;
}
