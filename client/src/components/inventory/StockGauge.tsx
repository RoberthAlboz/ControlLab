import type { CSSProperties } from "react";
import type { StockHealth } from "@shared/inventory";

/**
 * Saldo disponível lido num manômetro: arco de 240°, faixa vermelha até o
 * estoque mínimo e agulha no disponível. O fundo de escala acompanha o item
 * (3× o mínimo ou o físico, o que for maior), arredondado para um número
 * redondo. Item em manutenção ou indisponível fica com o mostrador apagado.
 */
type StockGaugeProps = {
  available: number;
  physical: number;
  minQuantity: number;
  unit: string;
  health: StockHealth;
};

const SWEEP = 240;
const START = -SWEEP / 2;
const R = 30;

/** Ponto no arco: 0° = topo, sentido horário. */
const point = (r: number, deg: number) => {
  const a = (deg * Math.PI) / 180;
  return `${(Math.sin(a) * r).toFixed(2)} ${(-Math.cos(a) * r).toFixed(2)}`;
};
const arc = (r: number, from: number, to: number) =>
  `M${point(r, from)}A${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${point(r, to)}`;

/** Próximo valor "redondo" (1, 2, 5 × 10ⁿ) maior ou igual a `value`. */
function niceCeil(value: number) {
  if (value <= 5) return 5;
  const power = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 5, 10].find(factor => factor * power >= value) ?? 10;
  return step * power;
}

const MAJOR_TICKS = Array.from({ length: 5 }, (_, i) => START + (SWEEP / 4) * i);
const MINOR_TICKS = Array.from({ length: 21 }, (_, i) => START + (SWEEP / 20) * i);

export default function StockGauge({ available, physical, minQuantity, unit, health }: StockGaugeProps) {
  const max = niceCeil(Math.max(minQuantity * 3, physical, available, 1));
  const angle = (value: number) => START + SWEEP * Math.min(1, Math.max(0, value / max));
  const needle = angle(available);
  const offline = health === "manutencao" || health === "indisponivel" || health === "arquivado";
  const alert = !offline && (health === "baixo" || health === "sem_saldo");

  return (
    <figure
      className={`stock-gauge${offline ? " is-offline" : alert ? " is-alert" : ""}`}
      aria-label={`Disponível: ${available} ${unit}${minQuantity ? `, mínimo ${minQuantity}` : ""}, escala até ${max}`}
    >
      <svg viewBox="-38 -38 76 76" aria-hidden="true" focusable="false">
        <circle className="stock-gauge-bezel" r={36} />
        <circle className="stock-gauge-face" r={33} />
        <path className="stock-gauge-track" d={arc(R, START, START + SWEEP)} />
        {minQuantity > 0 && <path className="stock-gauge-zone" d={arc(R, START, angle(minQuantity))} />}
        <path className="stock-gauge-ticks is-minor" d={MINOR_TICKS.map(deg => `M${point(R - 2.5, deg)}L${point(R + 1.5, deg)}`).join("")} />
        <path className="stock-gauge-ticks" d={MAJOR_TICKS.map(deg => `M${point(R - 4.5, deg)}L${point(R + 1.5, deg)}`).join("")} />
        <text className="stock-gauge-scale" x={-21} y={23}>0</text>
        <text className="stock-gauge-scale" x={21} y={23}>{max}</text>
        <g className="stock-gauge-needle" style={{ "--needle": `${needle}deg` } as CSSProperties}>
          <path d={`M-1.6 4L0 -${R - 3}L1.6 4Z`} />
        </g>
        <circle className="stock-gauge-hub" r={3} />
        <text className="stock-gauge-value" y={17}>{available}</text>
      </svg>
      <figcaption>{offline ? "Fora de uso" : minQuantity ? `mín. ${minQuantity} ${unit}` : unit}</figcaption>
    </figure>
  );
}
