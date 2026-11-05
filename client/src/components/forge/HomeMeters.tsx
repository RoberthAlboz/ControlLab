import { useId } from "react";

/**
 * Medidores dos cartões do Início. Só desenham valores que o cartão já calcula.
 * Com `label` viram progressbar; sem ele são decorativos, porque o texto do cartão já diz o valor.
 */
type MeterProps = {
  value: number;
  label?: string;
  valueText?: string;
};

const clampPercent = (value: number) =>
  Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : 0;

const meterRole = (percent: number, label?: string, valueText?: string) =>
  label
    ? ({
        role: "progressbar",
        "aria-label": label,
        "aria-valuemin": 0,
        "aria-valuemax": 100,
        "aria-valuenow": percent,
        "aria-valuetext": valueText,
      } as const)
    : ({ "aria-hidden": true } as const);

function StrokeMeter({
  kind,
  path,
  viewBox,
  value,
  label,
  valueText,
}: MeterProps & { kind: string; path: string; viewBox: string }) {
  const percent = clampPercent(value);
  const gradientId = useId();
  return (
    <span className={`hd-meter ${kind}`} {...meterRole(percent, label, valueText)}>
      <svg viewBox={viewBox} aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="1" x2="1" y2="0">
            <stop offset="0" stopColor="var(--hd-red-a)" />
            <stop offset="1" stopColor="var(--hd-red-b)" />
          </linearGradient>
        </defs>
        <path className="hd-meter-track" d={path} pathLength={100} />
        {percent > 0 && (
          <path
            className="hd-meter-value"
            d={path}
            pathLength={100}
            stroke={`url(#${gradientId})`}
            strokeDasharray={`${percent} 100`}
          />
        )}
      </svg>
    </span>
  );
}

/** Arco de meia-volta. */
export function HalfGauge(props: MeterProps) {
  return (
    <StrokeMeter
      {...props}
      kind="hd-half"
      viewBox="0 0 200 108"
      path="M14 100A86 86 0 0 1 186 100"
    />
  );
}

/** Trilho em forma de cápsula, começando no meio da borda inferior. */
export function PillGauge(props: MeterProps) {
  return (
    <StrokeMeter
      {...props}
      kind="hd-pill"
      viewBox="0 0 240 84"
      path="M120 76H42A34 34 0 0 1 42 8H198A34 34 0 0 1 198 76H120"
    />
  );
}

/** Colunas preenchidas a partir da direita: o valor mais recente fica na ponta. */
export function TickBars({
  filled,
  total,
  start,
  end,
}: {
  filled: number;
  total: number;
  start: string;
  end: string;
}) {
  return (
    <span className="hd-ticks" aria-hidden="true">
      <span className="hd-ticks-bars">
        {Array.from({ length: total }, (_, index) => (
          <i key={index} className={index >= total - filled ? "is-on" : ""} />
        ))}
      </span>
      <span className="hd-ticks-axis">
        <span>{start}</span>
        <span>{end}</span>
      </span>
    </span>
  );
}
