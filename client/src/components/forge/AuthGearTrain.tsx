import { useEffect, useRef } from "react";
import { buildTrain, deg, gearPath, trainBounds } from "@/lib/gears";

/**
 * Trem de engrenagens do painel de login, desenhado como prancha técnica.
 * Todas as engrenagens têm o mesmo módulo e engrenam de verdade: fase e
 * velocidade de cada uma derivam da engrenagem "mãe" (relação de dentes).
 * Reage ao formulário: digitar acelera, enviar dispara, erro dá um tranco,
 * login aceito trava o trem.
 */
type AuthGearTrainProps = {
  /** Muda a cada tecla digitada (ex.: soma dos comprimentos dos campos). */
  activity: number;
  /** Login em andamento: o trem gira em alta. */
  busy: boolean;
  /** Incrementa a cada erro de login: o trem engasga e volta. */
  jolt: number;
  /** Login aceito: o trem desacelera até parar e trava. */
  locked?: boolean;
  /** Classe extra no contêiner, para posicionar o trem em outros painéis. */
  className?: string;
};

const MODULE = 7;
const BASE_SPEED = 0.1; // rad/s da engrenagem principal em repouso

const TRAIN = buildTrain(
  [
    { teeth: 36, accent: true },
    { teeth: 16, parent: 0, angle: -140 },
    { teeth: 26, parent: 1, angle: -75 },
    { teeth: 11, parent: 2, angle: -15, accent: true },
    { teeth: 20, parent: 3, angle: -80 },
    { teeth: 13, parent: 0, angle: 165 },
  ],
  MODULE,
);
const BOUNDS = trainBounds(TRAIN, MODULE, MODULE * 4);
const VIEW_BOX = `${BOUNDS.minX.toFixed(0)} ${BOUNDS.minY.toFixed(0)} ${(BOUNDS.maxX - BOUNDS.minX).toFixed(0)} ${(BOUNDS.maxY - BOUNDS.minY).toFixed(0)}`;
const GHOST_PATH = gearPath(24, MODULE);

export default function AuthGearTrain({ activity, busy, jolt, locked = false, className = "" }: AuthGearTrainProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const gearRefs = useRef<(SVGGElement | null)[]>([]);
  const ghostRef = useRef<SVGGElement>(null);
  const state = useRef({ angle: 0, velocity: 1, busy, locked, px: 0, py: 0, tx: 0, ty: 0 });

  state.current.busy = busy;
  state.current.locked = locked;

  useEffect(() => {
    if (activity === 0) return;
    state.current.velocity = Math.min(state.current.velocity + 1.6, 9);
  }, [activity]);

  useEffect(() => {
    if (jolt === 0) return;
    state.current.velocity = -4;
  }, [jolt]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    // Com "reduzir movimento" o trem continua girando, mas só em rotação lenta e constante:
    // sem aceleração ao digitar, tranco no erro nem paralaxe.
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let frame = 0;
    let last = performance.now();
    let visible = true;

    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible && !frame) {
        last = performance.now();
        frame = requestAnimationFrame(tick);
      }
    });
    observer.observe(root);

    const onPointer = (event: PointerEvent) => {
      state.current.tx = (event.clientX / window.innerWidth - 0.5) * 2;
      state.current.ty = (event.clientY / window.innerHeight - 0.5) * 2;
    };
    if (!calm) window.addEventListener("pointermove", onPointer, { passive: true });

    function tick(now: number) {
      const s = state.current;
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      if (calm) s.velocity = s.locked ? 0 : 0.6;
      const target = calm ? s.velocity : s.locked ? 0 : s.busy ? 10 : 1;
      // Travando, freia forte: o trem para em ~0,4 s, antes da troca de tela.
      const rate = s.locked ? 9 : s.velocity < target ? 3 : 1.4;
      s.velocity += (target - s.velocity) * Math.min(1, dt * rate);
      s.angle += s.velocity * BASE_SPEED * dt;
      s.px += (s.tx - s.px) * Math.min(1, dt * 2.5);
      s.py += (s.ty - s.py) * Math.min(1, dt * 2.5);

      TRAIN.forEach((gear, index) => {
        gearRefs.current[index]?.setAttribute("transform", `rotate(${deg(gear.phase + s.angle * gear.ratio)})`);
      });
      ghostRef.current?.setAttribute("transform", `rotate(${deg(-s.angle * 0.6)})`);
      root!.style.setProperty("--gear-px", s.px.toFixed(3));
      root!.style.setProperty("--gear-py", s.py.toFixed(3));
      root!.style.setProperty("--gear-energy", Math.min(1, Math.abs(s.velocity - 1) / 6).toFixed(3));

      frame = visible ? requestAnimationFrame(tick) : 0;
    }
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("pointermove", onPointer);
    };
  }, []);

  return (
    <div ref={rootRef} className={`auth-gears${locked ? " is-locked" : ""} ${className}`} aria-hidden="true">
      <svg className="auth-gears-ghost" viewBox="-110 -110 220 220" focusable="false">
        <circle r={84} className="auth-gears-pitch" />
        <g ref={ghostRef}>
          <path d={GHOST_PATH} fillRule="evenodd" />
        </g>
      </svg>

      <svg className="auth-gears-train" viewBox={VIEW_BOX} style={{ aspectRatio: `${BOUNDS.maxX - BOUNDS.minX} / ${BOUNDS.maxY - BOUNDS.minY}` }} focusable="false">
        <defs>
          <radialGradient id="auth-gear-accent" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="scale(140)">
            <stop offset="0" stopColor="#ff9ea1" stopOpacity="0.42" />
            <stop offset="0.55" stopColor="#c4080c" stopOpacity="0.3" />
            <stop offset="1" stopColor="#8e0707" stopOpacity="0.2" />
          </radialGradient>
          <radialGradient id="auth-gear-glow">
            <stop offset="0" stopColor="#c4080c" stopOpacity="0.5" />
            <stop offset="1" stopColor="#c4080c" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Linhas de centro e círculos primitivos: a "prancha" por trás das peças. */}
        <g className="auth-gears-blueprint">
          {TRAIN.map((gear, index) => (
            <g key={`bp-${index}`} transform={`translate(${gear.x.toFixed(2)} ${gear.y.toFixed(2)})`}>
              <circle r={gear.pitch} className="auth-gears-pitch" />
              <path d={`M${-gear.pitch - MODULE * 3} 0H${gear.pitch + MODULE * 3}M0 ${-gear.pitch - MODULE * 3}V${gear.pitch + MODULE * 3}`} className="auth-gears-axis" />
            </g>
          ))}
          {TRAIN.map((gear, index) =>
            gear.parent === undefined ? null : (
              <line key={`link-${index}`} x1={TRAIN[gear.parent].x} y1={TRAIN[gear.parent].y} x2={gear.x} y2={gear.y} className="auth-gears-link" />
            ),
          )}
        </g>

        <circle r={TRAIN[0].pitch * 1.25} fill="url(#auth-gear-glow)" className="auth-gears-glow" />

        {TRAIN.map((gear, index) => (
          <g key={index} transform={`translate(${gear.x.toFixed(2)} ${gear.y.toFixed(2)})`} className={gear.accent ? "auth-gear is-accent" : "auth-gear"}>
            <g ref={el => {
                gearRefs.current[index] = el;
              }} transform={`rotate(${deg(gear.phase)})`}>
              <path d={gear.path} fillRule="evenodd" fill={gear.accent ? "url(#auth-gear-accent)" : undefined} />
            </g>
            <circle r={MODULE * 0.55} className="auth-gears-shaft" />
          </g>
        ))}

        {/* Pontos de contato: onde um dente empurra o outro. */}
        {TRAIN.map((gear, index) => {
          if (gear.parent === undefined) return null;
          const parent = TRAIN[gear.parent];
          const t = parent.pitch / (parent.pitch + gear.pitch);
          return <circle key={`mesh-${index}`} cx={parent.x + (gear.x - parent.x) * t} cy={parent.y + (gear.y - parent.y) * t} r={MODULE * 0.5} className="auth-gears-mesh" style={{ animationDelay: `${index * -0.37}s` }} />;
        })}
      </svg>
    </div>
  );
}
