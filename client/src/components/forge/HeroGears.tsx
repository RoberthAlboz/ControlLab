import type { CSSProperties } from "react";
import { buildTrain, deg } from "@/lib/gears";

/**
 * Engrenagens do banner dos módulos: três engrenadas, duas grandes cortadas no canto superior direito
 * e uma menor inteira, girando devagar e sem parar. O período vem da relação de dentes,
 * então a velocidade e o sentido de cada uma batem com as vizinhas.
 */
const MODULE = 10;
const BASE_PERIOD = 120; // segundos por volta da engrenagem maior
const TRAIN = buildTrain(
  [{ teeth: 16 }, { teeth: 14, parent: 0, angle: 190 }, { teeth: 12, parent: 1, angle: 115 }],
  MODULE
);

export default function HeroGears() {
  return (
    <div className="library-hero-gears" aria-hidden="true">
      {TRAIN.map((gear, index) => {
        const radius = gear.pitch + MODULE;
        const style = {
          left: `calc(${(gear.x - radius).toFixed(2)} * var(--hg-u))`,
          top: `calc(${(gear.y - radius).toFixed(2)} * var(--hg-u))`,
          width: `calc(${radius * 2} * var(--hg-u))`,
          height: `calc(${radius * 2} * var(--hg-u))`,
          "--phase": `${deg(gear.phase)}deg`,
          "--period": `${(BASE_PERIOD / Math.abs(gear.ratio)).toFixed(1)}s`,
          "--dir": gear.ratio < 0 ? "reverse" : "normal",
        } as CSSProperties;
        return (
          <span className="hd-gear" key={index} style={style}>
            <svg viewBox={`${-radius} ${-radius} ${radius * 2} ${radius * 2}`}>
              <path d={gear.path} fillRule="evenodd" />
            </svg>
          </span>
        );
      })}
    </div>
  );
}
