import { useEffect, useRef } from "react";
import { buildTrain, deg, type Gear } from "@/lib/gears";

/**
 * Fundo de todas as telas: nada de imagem. A primeira engrenagem já está lá ao abrir; as outras surgem
 * em faixas da rolagem e giram engrenadas; o brilho vermelho cresce junto, sem dominar a página.
 * Página sem rolagem ou movimento reduzido: mostra a composição final, parada.
 */
const MODULE = 10;
const TURN = Math.PI * 1.2; // rad da engrenagem principal do topo ao fim da página
const MIN_SCROLL = 40;
const GLOW_REST = 0.12;

type Reveal = { gear: Gear; from: number; to: number };
type Group = { side: string; gears: Reveal[] };
type GearSpec = Parameters<typeof buildTrain>[0][number];

/** Monta um trem engrenado; `bands[i]` é a faixa da rolagem em que a engrenagem i surge. */
function group(side: string, specs: GearSpec[], bands: [number, number][]): Group {
  const train = buildTrain(specs, MODULE);
  return { side, gears: train.map((gear, index) => ({ gear, from: bands[index][0], to: bands[index][1] })) };
}

// Já visível no topo (faixa -1 a 0), para a página não abrir vazia.
const DASHBOARD = [
  group(
    "is-right",
    [{ teeth: 34 }, { teeth: 18, parent: 0, angle: 118 }, { teeth: 26, parent: 1, angle: 172 }],
    [[-1, 0], [0.2, 0.5], [0.55, 0.85]]
  ),
  group("is-left", [{ teeth: 30 }, { teeth: 14, parent: 0, angle: -38 }], [[0.4, 0.7], [0.7, 1]]),
];

/** A mesma linguagem do Início, com uma composição própria em cada tela. */
const SCENES: Record<string, Group[]> = {
  dashboard: DASHBOARD,
  library: [
    group("is-right", [{ teeth: 40 }, { teeth: 16, parent: 0, angle: 205 }], [[-1, 0], [0.3, 0.8]]),
    group("is-left", [{ teeth: 22 }], [[0.2, 0.7]]),
  ],
  notes: [group("is-right", [{ teeth: 24 }, { teeth: 12, parent: 0, angle: 140 }], [[-1, 0], [0.3, 0.8]])],
  reader: [
    group("is-right", [{ teeth: 44 }, { teeth: 12, parent: 0, angle: 160 }], [[-1, 0], [0.2, 0.6]]),
  ],
  inventory: [
    group("is-left", [{ teeth: 28 }, { teeth: 20, parent: 0, angle: -30 }, { teeth: 12, parent: 1, angle: 40 }], [[-1, 0], [0.2, 0.6], [0.6, 1]]),
  ],
  oversight: [
    group("is-right", [{ teeth: 20 }, { teeth: 32, parent: 0, angle: 200 }], [[-1, 0], [0.3, 0.8]]),
  ],
  classrooms: [
    group("is-right", [{ teeth: 22 }, { teeth: 22, parent: 0, angle: 150 }, { teeth: 22, parent: 1, angle: 210 }], [[-1, 0], [-1, 0], [-1, 0]]),
  ],
  editor: [
    group("is-left", [{ teeth: 26 }, { teeth: 14, parent: 0, angle: 30 }], [[-1, 0], [0.2, 0.7]]),
  ],
  users: [
    group("is-right", [{ teeth: 30 }], [[-1, 0]]),
    group("is-left", [{ teeth: 18 }], [[-1, 0]]),
  ],
};

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

export default function HomeBackdrop({ screen = "dashboard" }: { screen?: string }) {
  const glowRef = useRef<HTMLElement>(null);
  const gearRefs = useRef<(HTMLElement | null)[]>([]);
  const groups = SCENES[screen] ?? DASHBOARD;

  useEffect(() => {
    const reveals = groups.flatMap(entry => entry.gears);
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
      reveals.forEach(({ gear, from, to }, index) => {
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
  }, [groups]);

  let index = -1;
  return (
    <div className="hd-backdrop" aria-hidden="true">
      <i className="hd-backdrop-glow" ref={glowRef} />
      {groups.map(entry => (
        <div className={`hd-gears ${entry.side}`} key={entry.side}>
          {entry.gears.map(({ gear }) => {
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
