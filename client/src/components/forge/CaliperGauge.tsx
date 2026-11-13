import { useEffect, useId, useRef, useState, type ReactNode } from "react";

/**
 * Progresso lido num paquímetro: a escala fixa vai de 0 a 100 (1 traço = 1%) e o
 * nônio do cursor tem 10 divisões em 9 traços, como um paquímetro de 0,1 mm.
 * O traço do nônio que coincide com a escala dá a casa decimal — a leitura
 * funciona de verdade. Ao montar, o cursor abre a partir do zero; cursor, cota e
 * leitura numérica saem do mesmo valor animado, então nunca se desencontram.
 * O cursor arranca, desliza, passa um pouco do ponto e assenta; nos batentes (0 e 100)
 * ele bate e volta um pouco. A roldana gira com o movimento e, ao parar, o parafuso
 * de trava aperta e a coincidência acende.
 */
type CaliperGaugeProps = {
  /** 0–100, pode ter casa decimal. */
  value: number;
  label: string;
  /** Linha de contexto sob o paquímetro (ex.: "3 de 4 etapas concluídas"). */
  caption?: ReactNode;
};

const X0 = 34; // zero da escala principal (face de medição da orelha fixa)
const UNIT = 2.6; // largura de 1% no viewBox
const BEAM_TOP = 22;
const BEAM_BOTTOM = 46;
const SLIDER_WIDTH = 52;
const BEAM_END = X0 + 100 * UNIT + SLIDER_WIDTH + 6; // a haste passa do cursor mesmo em 100%
const JAW_TIP = 98;
const DIMENSION_Y = 86;
const KNURL_STEP = 2;

const decimal = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const easeInOut = (t: number) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

const DURATION_MIN = 750;
const DURATION_MAX = 1800;
const TRAVEL_SHARE = 0.72; // parte do tempo em que o cursor percorre o caminho; o resto é o assentamento
const OVERSHOOT_MAX = 1.2;
const REBOUND = 0.6;

/** Posição do cursor em `t` (0–1) indo de `from` a `to`, com o assentamento no fim. */
function sliderPosition(from: number, to: number, t: number) {
  const distance = to - from;
  const direction = Math.sign(distance);
  const overshoot = Math.min(OVERSHOOT_MAX, Math.abs(distance) * 0.1);
  const peak = to + direction * overshoot;
  const hitsStop = peak < 0 || peak > 100 || to === 0 || to === 100;
  if (t < TRAVEL_SHARE) {
    const eased = easeInOut(t / TRAVEL_SHARE);
    return from + ((hitsStop ? to : peak) - from) * eased;
  }
  const settling = (t - TRAVEL_SHARE) / (1 - TRAVEL_SHARE);
  if (hitsStop) return to - direction * Math.min(REBOUND, Math.abs(distance) * 0.1) * Math.sin(Math.PI * settling) * (1 - settling);
  return to + direction * overshoot * Math.exp(-4 * settling) * Math.cos(2.5 * Math.PI * settling);
}

const tickPath = (filter: (i: number) => boolean, length: (i: number) => number) =>
  Array.from({ length: 101 }, (_, i) => i)
    .filter(filter)
    .map(i => `M${(X0 + i * UNIT).toFixed(2)} ${BEAM_BOTTOM}v${-length(i)}`)
    .join("");
const MINOR_TICKS = tickPath(i => i % 5 !== 0, () => 4);
const MID_TICKS = tickPath(i => i % 5 === 0 && i % 10 !== 0, () => 6);
const MAJOR_TICKS = tickPath(i => i % 10 === 0, () => 9);

const FIXED_LOWER_JAW = `M14 ${BEAM_BOTTOM}H${X0}V92L${X0 - 1.5} ${JAW_TIP}L${X0 - 8} 90L20 66Q14 60 14 ${BEAM_BOTTOM}Z`;
const FIXED_UPPER_JAW = `M${X0 - 15} ${BEAM_TOP}L${X0 - 5} 4H${X0}V${BEAM_TOP}Z`;
const SLIDER_RAIL = `M${X0} ${BEAM_TOP}V4H${X0 + 5}L${X0 + 14} 14H${X0 + SLIDER_WIDTH}V${BEAM_TOP}Z`;
const SLIDER_PLATE = `M${X0} ${BEAM_BOTTOM}H${X0 + SLIDER_WIDTH}V64Q${X0 + SLIDER_WIDTH} 68 ${X0 + SLIDER_WIDTH - 4} 68H${X0 + 20}L${X0 + 8} 90L${X0 + 1.5} ${JAW_TIP}L${X0} 92Z`;

export default function CaliperGauge({ value, label, caption }: CaliperGaugeProps) {
  const reading = Number.isFinite(value) ? Math.round(clamp(value, 0, 100) * 10) / 10 : 0;
  const [shown, setShown] = useState(0);
  const shownRef = useRef(0);
  const uid = useId().replace(/:/g, "");

  useEffect(() => {
    const from = shownRef.current;
    if (from === reading || prefersReducedMotion()) {
      shownRef.current = reading;
      setShown(reading);
      return;
    }
    // Um trecho curto não leva o mesmo tempo que a régua inteira.
    const duration = clamp(500 + Math.abs(reading - from) * 14, DURATION_MIN, DURATION_MAX);
    let frame = 0;
    let start: number | null = null;
    const tick = (now: number) => {
      if (start === null) start = now;
      const t = Math.min(1, (now - start) / duration);
      // No último quadro usa o valor exato: a conta em ponto flutuante pode parar a 1e-15 dele.
      const next = t < 1 ? clamp(sliderPosition(from, reading, t), 0, 100) : reading;
      shownRef.current = next;
      setShown(next);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [reading]);

  const tenths = Math.round(shown * 10);
  const whole = Math.floor(tenths / 10);
  const tenth = tenths % 10;
  const offset = shown * UNIT;
  const complete = tenths >= 1000;
  // Com o cursor em movimento a coincidência muda a cada quadro; o destaque
  // vermelho e a trava só aparecem quando ele assenta na leitura.
  const settled = shown === reading;
  // A roldana gira conforme o cursor anda: o serrilhado corre dentro do recorte.
  const knurlShift = (offset * 1.5) % KNURL_STEP;

  return (
    <div className={`caliper-gauge${complete ? " is-complete" : ""}${settled ? " is-settled" : ""}`}>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(reading)}
        aria-valuetext={`${decimal(reading)}% concluído`}
      >
        <svg viewBox={`0 0 ${BEAM_END + 2} ${JAW_TIP + 3}`} aria-hidden="true" focusable="false">
          <defs>
            <linearGradient id={`${uid}-beam`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" className="caliper-stop-beam-a" />
              <stop offset="0.35" className="caliper-stop-beam-b" />
              <stop offset="0.7" className="caliper-stop-beam-c" />
              <stop offset="1" className="caliper-stop-beam-d" />
            </linearGradient>
            <linearGradient id={`${uid}-steel`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" className="caliper-stop-steel-a" />
              <stop offset="0.5" className="caliper-stop-steel-b" />
              <stop offset="1" className="caliper-stop-steel-c" />
            </linearGradient>
            <linearGradient id={`${uid}-slider`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" className="caliper-stop-slider-a" />
              <stop offset="0.45" className="caliper-stop-slider-b" />
              <stop offset="1" className="caliper-stop-slider-c" />
            </linearGradient>
            <linearGradient id={`${uid}-sheen`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#ffffff" stopOpacity="0" />
              <stop offset="0.5" stopColor="#ffffff" stopOpacity="0.55" />
              <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
            </linearGradient>
            <linearGradient id={`${uid}-shade`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#000000" stopOpacity="0.28" />
              <stop offset="1" stopColor="#000000" stopOpacity="0" />
            </linearGradient>
            <clipPath id={`${uid}-beam-clip`}>
              <rect x="14" y={BEAM_TOP} width={BEAM_END - 14} height={BEAM_BOTTOM - BEAM_TOP} rx="1.5" />
            </clipPath>
            <clipPath id={`${uid}-knurl-clip`}>
              <rect x={X0 + 28} y="68" width="20" height="6" rx="2" />
            </clipPath>
          </defs>

          {/* Orelhas fixas, atrás da haste */}
          <path className="caliper-part" fill={`url(#${uid}-steel)`} d={FIXED_LOWER_JAW} />
          <path className="caliper-part" fill={`url(#${uid}-steel)`} d={FIXED_UPPER_JAW} />

          {/* Régua (haste) com a escala principal */}
          <rect className="caliper-part" fill={`url(#${uid}-beam)`} x="14" y={BEAM_TOP} width={BEAM_END - 14} height={BEAM_BOTTOM - BEAM_TOP} rx="1.5" />
          <path className="caliper-edge" d={`M15.5 ${BEAM_TOP + 0.8}H${BEAM_END - 1.5}`} />
          {/* O brilho corre pela haste em ritmo diferente do cursor, como luz sobre o aço. */}
          <g clipPath={`url(#${uid}-beam-clip)`}>
            <rect fill={`url(#${uid}-sheen)`} x={X0 + offset * 0.7 - 40} y={BEAM_TOP} width="110" height={BEAM_BOTTOM - BEAM_TOP} />
          </g>
          <path className="caliper-ticks is-minor" d={MINOR_TICKS} />
          <path className="caliper-ticks" d={MID_TICKS} />
          <path className="caliper-ticks is-major" d={MAJOR_TICKS} />
          {[0, 20, 40, 60, 80, 100].map(n => (
            <text key={n} x={X0 + n * UNIT} y={BEAM_TOP + 10} className="caliper-number">
              {n}
            </text>
          ))}
          <path className="caliper-ticks caliper-match" d={`M${(X0 + (whole + tenth) * UNIT).toFixed(2)} ${BEAM_BOTTOM}v-9`} />

          {/* Cursor: orelhas móveis, janela, nônio, roldana e trava */}
          <g transform={`translate(${offset.toFixed(2)} 0)`}>
            <rect fill={`url(#${uid}-shade)`} x={X0 + SLIDER_WIDTH} y={BEAM_TOP} width="5" height={BEAM_BOTTOM - BEAM_TOP} />

            <g className="caliper-screw">
              <path className="caliper-part is-dark" d={`M${X0 + 29} 14V10H${X0 + 37}V14Z`} />
              <rect className="caliper-part is-dark" x={X0 + 26} y="3" width="14" height="7" rx="1.5" />
              <path className="caliper-knurl is-light" d={`M${X0 + 28} 3.8v5.4M${X0 + 30} 3.8v5.4M${X0 + 32} 3.8v5.4M${X0 + 34} 3.8v5.4M${X0 + 36} 3.8v5.4M${X0 + 38} 3.8v5.4`} />
            </g>

            <rect className="caliper-part is-dark" x={X0 + 28} y="66" width="20" height="8" rx="2.5" />
            <g clipPath={`url(#${uid}-knurl-clip)`}>
              <path
                className="caliper-knurl is-light"
                transform={`translate(${knurlShift.toFixed(2)} 0)`}
                d={Array.from({ length: 13 }, (_, i) => `M${X0 + 26 + i * KNURL_STEP} 68v6`).join("")}
              />
            </g>

            <path className="caliper-part" fill={`url(#${uid}-slider)`} d={SLIDER_RAIL} />
            <path className="caliper-part" fill={`url(#${uid}-slider)`} d={SLIDER_PLATE} />
            <path className="caliper-edge" d={`M${X0 + 0.8} ${BEAM_BOTTOM + 0.8}H${X0 + SLIDER_WIDTH - 0.8}`} />
            <path className="caliper-edge" d={`M${X0 + 14.5} 14.8H${X0 + SLIDER_WIDTH - 0.8}`} />

            {/* Janela de vidro sobre a haste, com um reflexo em diagonal */}
            <rect className="caliper-window" x={X0} y={BEAM_TOP} width={SLIDER_WIDTH} height={BEAM_BOTTOM - BEAM_TOP} />
            <path className="caliper-glare" d={`M${X0 + 14} ${BEAM_TOP}h9l-9 ${BEAM_BOTTOM - BEAM_TOP}h-9zM${X0 + 26} ${BEAM_TOP}h3l-9 ${BEAM_BOTTOM - BEAM_TOP}h-3z`} />

            {Array.from({ length: 11 }, (_, k) => (
              <path
                key={k}
                className={`caliper-vernier${k === tenth ? " caliper-match" : ""}`}
                d={`M${(X0 + k * 0.9 * UNIT).toFixed(2)} ${BEAM_BOTTOM}v${k % 5 === 0 ? 8 : 5}`}
              />
            ))}
            <text x={X0 + 4.5 * UNIT} y={BEAM_BOTTOM + 15} className="caliper-vernier-label">
              0,1
            </text>
          </g>

          {/* Cota entre as orelhas: a linha estica junto com o cursor */}
          <g className={`caliper-dimension${shown > 4 ? "" : " is-hidden"}`}>
            <path d={`M${X0} ${DIMENSION_Y}H${(X0 + offset).toFixed(2)}`} />
            <path d={`M${X0 + 4} ${DIMENSION_Y - 3}L${X0} ${DIMENSION_Y}L${X0 + 4} ${DIMENSION_Y + 3}`} />
            <path
              d={`M${X0 - 4} ${DIMENSION_Y - 3}L${X0} ${DIMENSION_Y}L${X0 - 4} ${DIMENSION_Y + 3}`}
              transform={`translate(${offset.toFixed(2)} 0)`}
            />
          </g>
        </svg>
      </div>
      <div className="caliper-reading" aria-hidden="true">
        <div className="caliper-reading-meta">
          {caption && <span className="caliper-caption">{caption}</span>}
        </div>
        <strong>{decimal(tenths / 10)}%</strong>
      </div>
    </div>
  );
}
