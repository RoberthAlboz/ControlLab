import { useEffect, useRef } from "react";
import { buildTrain, deg } from "@/lib/gears";

/**
 * Engrenagens dentro do banner vermelho dos módulos. Mesma animação do fundo do Início:
 * a primeira já está lá, as outras surgem com a rolagem e todas giram engrenadas, só que mais devagar.
 */
const MODULE = 10;
const TURN = Math.PI * 0.02 * 0.6;
const MIN_SCROLL = 40;
const SPECS = [{ teeth: 26 }, { teeth: 14, parent: 0, angle: 200 }, { teeth: 18, parent: 1, angle: 150 }];
const BANDS: [number, number][] = [[-1, 0], [0.15, 0.5], [0.45, 0.85]];
const TRAIN = buildTrain(SPECS, MODULE);
const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

export default function HeroGears() {
  const refs = useRef<(HTMLElement | null)[]>([]);

  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    const paint = () => {
      frame = 0;
      const root = document.documentElement;
      const range = root.scrollHeight - root.clientHeight;
      const still = motion.matches || range < MIN_SCROLL;
      const progress = still ? 1 : clamp01(root.scrollTop / range);
      TRAIN.forEach((gear, index) => {
        const element = refs.current[index];
        if (!element) return;
        const [from, to] = BANDS[index];
        element.style.opacity = String(clamp01((progress - from) / (to - from)));
        element.style.transform = `rotate(${deg(gear.phase + (motion.matches ? 0 : progress * TURN * gear.ratio))}deg)`;
      });
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(paint);
    };
    paint();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    const observer = new ResizeObserver(schedule);
    observer.observe(document.body);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      observer.disconnect();
    };
  }, []);

  return (
    <div className="library-hero-gears" aria-hidden="true">
      {TRAIN.map((gear, index) => {
        const radius = gear.pitch + MODULE;
        return (
          <span
            className="hd-gear"
            key={index}
            ref={element => {
              refs.current[index] = element;
            }}
            style={{
              left: `calc(${(gear.x - radius).toFixed(2)} * var(--hg-u))`,
              top: `calc(${(gear.y - radius).toFixed(2)} * var(--hg-u))`,
              width: `calc(${radius * 2} * var(--hg-u))`,
              height: `calc(${radius * 2} * var(--hg-u))`,
            }}
          >
            <svg viewBox={`${-radius} ${-radius} ${radius * 2} ${radius * 2}`}>
              <path d={gear.path} fillRule="evenodd" />
            </svg>
          </span>
        );
      })}
    </div>
  );
}
