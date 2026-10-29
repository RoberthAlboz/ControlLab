import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Progresso lido num paquímetro: a escala fixa vai de 0 a 100 (1 traço = 1%) e o
 * nônio do cursor tem 10 divisões em 9 traços, como um paquímetro de 0,1 mm.
 * O traço do nônio que coincide com a escala dá a casa decimal — a leitura
 * funciona de verdade. Ao montar, o cursor abre a partir do zero; cursor, cota e
 * leitura numérica saem do mesmo valor animado, então nunca se desencontram.
 * Ao parar, o parafuso de trava aperta e a coincidência acende.
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
const BEAM_TOP = 20;
const BEAM_BOTTOM = 44;
const BEAM_END = X0 + 100 * UNIT + 56; // a haste passa do cursor mesmo em 100%
const JAW_BOTTOM = 92;
const DURATION = 1100;

const decimal = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const easeOut = (t: number) => 1 - (1 - t) ** 4;
const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

const MAIN_TICKS = Array.from({ length: 101 }, (_, i) => {
  const length = i % 10 === 0 ? 9 : i % 5 === 0 ? 6 : 4;
  return `M${(X0 + i * UNIT).toFixed(2)} ${BEAM_BOTTOM}v${-length}`;
}).join("");

export default function CaliperGauge({ value, label, caption }: CaliperGaugeProps) {
  const reading = Number.isFinite(value) ? Math.round(Math.max(0, Math.min(100, value)) * 10) / 10 : 0;
  const [shown, setShown] = useState(0);
  const shownRef = useRef(0);

  useEffect(() => {
    const from = shownRef.current;
    if (from === reading || prefersReducedMotion()) {
      shownRef.current = reading;
      setShown(reading);
      return;
    }
    let frame = 0;
    let start: number | null = null;
    const tick = (now: number) => {
      if (start === null) start = now;
      const t = Math.min(1, (now - start) / DURATION);
      // No último quadro usa o valor exato: a conta em ponto flutuante pode parar a 1e-15 dele.
      const next = t < 1 ? from + (reading - from) * easeOut(t) : reading;
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
        <svg viewBox={`0 0 ${BEAM_END + 8} 96`} aria-hidden="true" focusable="false">
          {/* Régua (haste) com a escala principal */}
          <path className="caliper-body" d={`M14 ${BEAM_TOP}H${BEAM_END}V${BEAM_BOTTOM}H14Z`} />
          <path className="caliper-ticks" d={MAIN_TICKS} />
          <path className="caliper-ticks caliper-match" d={`M${(X0 + (whole + tenth) * UNIT).toFixed(2)} ${BEAM_BOTTOM}v-9`} />
          {[0, 20, 40, 60, 80, 100].map(n => (
            <text key={n} x={X0 + n * UNIT} y={BEAM_TOP + 9} className="caliper-number">
              {n}
            </text>
          ))}

          {/* Orelha fixa */}
          <path className="caliper-body" d={`M14 ${BEAM_BOTTOM}H${X0}V${JAW_BOTTOM - 10}L${X0 - 6} ${JAW_BOTTOM}H20L14 ${JAW_BOTTOM - 14}Z`} />
          <path className="caliper-body" d={`M${X0 - 8} ${BEAM_TOP}V8H${X0}V${BEAM_TOP}Z`} />

          {/* Cursor: orelha móvel, janela e nônio */}
          <g transform={`translate(${offset.toFixed(2)} 0)`}>
            <path className="caliper-slider-body" d={`M${X0} 8V${BEAM_TOP}H${X0 + 44}V8H${X0 + 8}Z`} />
            <path
              className="caliper-slider-body"
              d={`M${X0} ${BEAM_BOTTOM}H${X0 + 44}V${BEAM_BOTTOM + 18}H${X0 + 14}V${JAW_BOTTOM - 10}L${X0 + 6} ${JAW_BOTTOM}H${X0}Z`}
            />
            <path className="caliper-window" d={`M${X0 - 2} ${BEAM_TOP}H${X0 + 46}V${BEAM_BOTTOM}H${X0 - 2}Z`} />
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
            <path className="caliper-screw" d={`M${X0 + 28} 4h8v4h-8z`} />
          </g>

          {/* Cota entre as orelhas: a linha estica junto com o cursor */}
          <g className={`caliper-dimension${shown > 4 ? "" : " is-hidden"}`}>
            <path d={`M${X0} ${JAW_BOTTOM - 4}H${(X0 + offset).toFixed(2)}`} />
            <path d={`M${X0 + 4} ${JAW_BOTTOM - 7}L${X0} ${JAW_BOTTOM - 4}L${X0 + 4} ${JAW_BOTTOM - 1}`} />
            <path
              d={`M${X0 - 4} ${JAW_BOTTOM - 7}L${X0} ${JAW_BOTTOM - 4}L${X0 - 4} ${JAW_BOTTOM - 1}`}
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
