import { useEffect, useRef } from "react";
import { buildTrain, deg, type Gear } from "@/lib/gears";

/**
 * Fundo do Início: nada de imagem. A primeira engrenagem já está lá ao abrir; as outras surgem
 * em faixas da rolagem e giram engrenadas; o brilho vermelho cresce junto, sem dominar a página.
 * Página sem rolagem ou movimento reduzido: mostra a composição final, parada.
 */
const MODULE = 10;
const TURN = Math.PI * 1.2; // rad da engrenagem principal do topo ao fim da página
const MIN_SCROLL = 40;
const GLOW_REST = 0.12;

const RIGHT = buildTrain(
  [
    { teeth: 34 },
    { teeth: 18, parent: 0, angle: 118 },
    { teeth: 26, parent: 1, angle: 172 },
  ],
  MODULE
);
const LEFT = buildTrain(
  [{ teeth: 30 }, { teeth: 14, parent: 0, angle: -38 }],
  MODULE
);

type Reveal = { gear: Gear; from: number; to: number };

const GROUPS: { side: string; gears: Reveal[] }[] = [
  {
    side: "is-right",
    gears: [
      // Já visível no topo, para a página não abrir vazia.
      { gear: RIGHT[0], from: -1, to: 0 },
      { gear: RIGHT[1], from: 0.2, to: 0.5 },
      { gear: RIGHT[2], from: 0.55, to: 0.85 },
    ],
  },
  {
    side: "is-left",
    gears: [
      { gear: LEFT[0], from: 0.4, to: 0.7 },
      { gear: LEFT[1], from: 0.7, to: 1 },
    ],
  },
];
const REVEALS = GROUPS.flatMap(group => group.gears);

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

export default function HomeBackdrop() {
  const glowRef = useRef<HTMLElement>(null);
  const gearRefs = useRef<(HTMLElement | null)[]>([]);

  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    const paint = () => {
      frame = 0;
      const root = document.documentElement;
      const range = root.scrollHeight - root.clientHeight;
      const still = motion.matches || range < MIN_SCROLL;
      const progress = still ? 1 : clamp01(root.scrollTop / range);
      if (glowRef.current) {
        glowRef.current.style.opacity = String(GLOW_REST + (1 - GLOW_REST) * progress);
      }
      REVEALS.forEach(({ gear, from, to }, index) => {
        const element = gearRefs.current[index];
        if (!element) return;
        element.style.opacity = String(clamp01((progress - from) / (to - from)));
        const turn = motion.matches ? 0 : progress * TURN * gear.ratio;
        element.style.transform = `rotate(${deg(gear.phase + turn)}deg)`;
      });
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(paint);
    };
    paint();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    motion.addEventListener("change", schedule);
    // Trocar de aba muda a altura da página sem rolar.
    const observer = new ResizeObserver(schedule);
    observer.observe(document.body);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      motion.removeEventListener("change", schedule);
      observer.disconnect();
    };
  }, []);

  let index = -1;
  return (
    <div className="hd-backdrop" aria-hidden="true">
      <i className="hd-backdrop-glow" ref={glowRef} />
      {GROUPS.map(group => (
        <div className={`hd-gears ${group.side}`} key={group.side}>
          {group.gears.map(({ gear }) => {
            index += 1;
            const slot = index;
            const radius = gear.pitch + MODULE;
            return (
              <span
                className="hd-gear"
                key={slot}
                ref={element => {
                  gearRefs.current[slot] = element;
                }}
                style={{
                  left: `calc(${(gear.x - radius).toFixed(2)} * var(--hd-u))`,
                  top: `calc(${(gear.y - radius).toFixed(2)} * var(--hd-u))`,
                  width: `calc(${radius * 2} * var(--hd-u))`,
                  height: `calc(${radius * 2} * var(--hd-u))`,
                }}
              >
                <svg viewBox={`${-radius} ${-radius} ${radius * 2} ${radius * 2}`}>
                  <path d={gear.path} fillRule="evenodd" />
                </svg>
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
}
