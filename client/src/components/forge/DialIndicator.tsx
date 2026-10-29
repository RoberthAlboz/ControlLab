import { useRef } from "react";

/**
 * Cronômetro da etapa lido num relógio comparador: o ponteiro grande dá uma
 * volta por minuto (1 traço = 1 s) e o contador de voltas embaixo marca os
 * minutos (uma volta = 30 min), como no instrumento de verdade. Cada segundo
 * avança o ponteiro com uma leve sobra, o "salto" típico da agulha.
 *
 * Os ângulos são acumulados (não voltam a 0 na virada do minuto) para a
 * transição nunca girar para trás; saltos grandes (troca de etapa, retomada)
 * vão direto, sem animar várias voltas.
 */
type DialIndicatorProps = {
  seconds: number;
  state: "pending" | "running" | "complete";
};

const FACE_R = 16.5;
const TICKS = Array.from({ length: 60 }, (_, i) => {
  const major = i % 5 === 0;
  const a = (i / 60) * Math.PI * 2;
  const r1 = FACE_R - (major ? 3.4 : 1.8);
  const r2 = FACE_R - 0.6;
  const p = (r: number) => `${(Math.sin(a) * r).toFixed(2)} ${(-Math.cos(a) * r).toFixed(2)}`;
  return { d: `M${p(r1)}L${p(r2)}`, major };
});
const MAJOR_TICKS = TICKS.filter(tick => tick.major).map(tick => tick.d).join("");
const MINOR_TICKS = TICKS.filter(tick => !tick.major).map(tick => tick.d).join("");

export default function DialIndicator({ seconds, state }: DialIndicatorProps) {
  const safe = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  const previous = useRef(safe);
  const jump = Math.abs(safe - previous.current) > 2;
  previous.current = safe;

  return (
    <svg className={`dial-indicator is-${state}${jump ? " is-jump" : ""}`} viewBox="-20 -24 40 44" aria-hidden="true" focusable="false">
      {/* Haste e ponta de contato, saindo por cima do corpo */}
      <path className="dial-stem" d="M-1.6 -24h3.2v5.4h-3.2Z" />
      <circle className="dial-bezel" r={19} />
      <circle className="dial-face" r={FACE_R} />
      <path className="dial-ticks is-minor" d={MINOR_TICKS} />
      <path className="dial-ticks" d={MAJOR_TICKS} />

      {/* Contador de voltas: 1 traço = 5 min, volta inteira = 30 min */}
      <g transform="translate(0 6.4)">
        <circle className="dial-counter" r={4.2} />
        <g className="dial-needle-small" style={{ transform: `rotate(${(safe * 0.2).toFixed(2)}deg)` }}>
          <path d="M0 0.8V-3.3" />
        </g>
      </g>

      <g className="dial-needle" style={{ transform: `rotate(${safe * 6}deg)` }}>
        <path d="M0 3.4V-14.6" />
      </g>
      <circle className="dial-hub" r={1.6} />
    </svg>
  );
}
