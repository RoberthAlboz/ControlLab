import type { CSSProperties } from "react";
import { buildTrain, deg, trainBounds } from "@/lib/gears";

/**
 * Indicador de carregamento com engrenagens entrelaçadas (identidade ForgeLab).
 * Mesma geometria do trem do login: as duas peças engrenam de verdade, com
 * fase casada e período na relação de dentes. O movimento é desligado
 * automaticamente com `prefers-reduced-motion`.
 */
type GearLoaderProps = {
  label?: string;
  size?: "sm" | "md" | "lg";
  inline?: boolean;
};

const MODULE = 3.2;
const PERIOD_S = 4; // uma volta da engrenagem maior

const TRAIN = buildTrain(
  [
    { teeth: 12 },
    { teeth: 8, parent: 0, angle: -32, accent: true },
  ],
  MODULE,
);
const BOUNDS = trainBounds(TRAIN, MODULE, MODULE * 0.5);
const VIEW_BOX = `${BOUNDS.minX.toFixed(1)} ${BOUNDS.minY.toFixed(1)} ${(BOUNDS.maxX - BOUNDS.minX).toFixed(1)} ${(BOUNDS.maxY - BOUNDS.minY).toFixed(1)}`;

export default function GearLoader({ label = "Carregando…", size = "md", inline = false }: GearLoaderProps) {
  return (
    <div className={`gear-loader gear-loader-${size} ${inline ? "is-inline" : ""}`} role="status" aria-live="polite">
      <svg viewBox={VIEW_BOX} aria-hidden="true" focusable="false">
        {TRAIN.map((gear, index) => (
          <g key={index} transform={`translate(${gear.x.toFixed(2)} ${gear.y.toFixed(2)}) rotate(${deg(gear.phase)})`} className={gear.accent ? "is-accent" : undefined}>
            <g
              className="gear-loader-spin"
              style={
                {
                  "--gear-period": `${(PERIOD_S / Math.abs(gear.ratio)).toFixed(3)}s`,
                  "--gear-direction": gear.ratio > 0 ? "normal" : "reverse",
                } as CSSProperties
              }
            >
              <path d={gear.path} fillRule="evenodd" />
            </g>
          </g>
        ))}
      </svg>
      <span>{label}</span>
    </div>
  );
}
