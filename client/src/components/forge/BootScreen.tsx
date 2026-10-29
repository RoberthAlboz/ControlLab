import { useEffect, useId, useState, type CSSProperties } from "react";
import { RotateCcw } from "lucide-react";
import { BRAND_MARK_HUB, BRAND_MARK_PATH } from "@/components/forge/BrandMark";

/**
 * Tela de carregamento em tela cheia (sessão, catálogo). Repete a marcação do
 * splash estático de index.html, onde moram os estilos .boot-*, então a troca
 * do HTML inicial para o React não pisca. As animações entram já defasadas pelo
 * tempo desde o carregamento da página, para continuar de onde o splash estava.
 * Depois de alguns segundos avisa da demora e, se houver onRetry, oferece repetir.
 */
type BootScreenProps = {
  label: string;
  onRetry?: () => void;
};

const SLOW_AFTER_MS = 8000;
const TICK_MS = 4900;
const BAR_MS = 1400;

export default function BootScreen({ label, onRetry }: BootScreenProps) {
  const gradientId = useId();
  const [slow, setSlow] = useState(false);
  const [elapsed] = useState(() => performance.now());

  useEffect(() => {
    const timer = window.setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, []);

  const delay = (period: number) => `-${Math.round(elapsed % period)}ms`;

  return (
    <div className="boot" aria-busy="true">
      <div className="boot-stack">
        <span className="boot-mark" aria-hidden="true">
          <svg viewBox="-50 -50 100 100" focusable="false" style={{ animationDelay: delay(TICK_MS) }}>
            <defs>
              <linearGradient id={gradientId} x1="-50" y1="-50" x2="50" y2="50" gradientUnits="userSpaceOnUse">
                <stop offset="0" stopColor="#8e0707" />
                <stop offset="1" stopColor="#c4080c" />
              </linearGradient>
            </defs>
            <path d={BRAND_MARK_PATH} fill={`url(#${gradientId})`} />
            <circle r={BRAND_MARK_HUB} fill={`url(#${gradientId})`} />
          </svg>
        </span>
        <span className="boot-word" role="img" aria-label="Control Lab">
          <b aria-hidden="true">control</b>
          <i aria-hidden="true">lab</i>
        </span>
        <span className="boot-bar" aria-hidden="true" style={{ "--boot-bar-delay": delay(BAR_MS) } as CSSProperties} />
        <p className="boot-label" role="status">
          {slow ? `${label} Está demorando mais que o normal.` : label}
        </p>
        {slow && onRetry && (
          <button type="button" className="boot-retry" onClick={onRetry}>
            <RotateCcw size={15} aria-hidden="true" /> Tentar novamente
          </button>
        )}
      </div>
    </div>
  );
}
