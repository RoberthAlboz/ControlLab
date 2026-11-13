import { useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";

/**
 * Eixo escalonado que vai sendo torneado conforme as etapas do módulo são
 * concluídas: cada etapa usina um trecho do tarugo bruto até o diâmetro final. A
 * ferramenta aproxima, entra no material, avança soltando cavaco e recua; o aço polido
 * aparece exatamente onde ela passou. Com a etapa em andamento o torno fica girando.
 * O perfil é derivado do id do módulo, então cada módulo "fabrica" a sua própria
 * peça. Concluído, a ferramenta sai e aparecem as cotas.
 */
type MachinedPartProps = {
  seed: string;
  total: number;
  completed: number;
  /** Etapa em andamento: o torno gira em marcha lenta. */
  running?: boolean;
};

const LENGTH = 220;
const STOCK_R = 26;
const AXIS_Y = 40;
const LEFT = 18;
const MAX_SEGMENTS = 8;
const CHAMFER = 1.4;
const STOCK_TOP = AXIS_Y - STOCK_R;
const RIGHT = LEFT + LENGTH;
const PARK_X = RIGHT - 6;
const CLEARANCE = 3;

const CUT_MS = 3000;
// Fases do ciclo, em fração do tempo total.
const APPROACH_END = 0.16;
const PLUNGE_END = 0.24;
const FEED_END = 0.8;

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Quanto o corte vai durar: a comemoração do módulo espera a peça ficar pronta. */
export const machiningDuration = () => (prefersReducedMotion() ? 0 : CUT_MS);

function random(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

type Segment = { x: number; width: number; r: number };

function buildProfile(seed: string, count: number): Segment[] {
  const next = random(seed);
  const weights = Array.from({ length: count }, () => 0.7 + next() * 0.7);
  const sum = weights.reduce((a, b) => a + b, 0);
  let x = LEFT;
  return weights.map((weight, index) => {
    const width = (weight / sum) * LENGTH;
    // Diâmetros "redondos" entre 40% e 90% do tarugo; o maior fica no meio, como um colar.
    const middle = 1 - Math.abs(index - (count - 1) / 2) / Math.max(1, count / 2);
    const r = Math.round((0.4 + 0.3 * next() + 0.2 * middle) * STOCK_R);
    const segment = { x, width, r: Math.min(r, STOCK_R - 3) };
    x += width;
    return segment;
  });
}

/** Contorno de um lado do eixo, com chanfro nas quinas de cada ressalto. `side` -1 = cima, 1 = baixo. */
function edgePoints(segments: Segment[], side: 1 | -1) {
  const y = (r: number) => AXIS_Y + side * r;
  const points: [number, number][] = [[LEFT, y(segments[0].r)]];
  segments.forEach((s, index) => {
    const end = s.x + s.width;
    const next = segments[index + 1];
    if (!next) {
      points.push([end - CHAMFER, y(s.r)], [end, y(s.r - CHAMFER)]);
    } else if (next.r < s.r) {
      points.push([end - CHAMFER, y(s.r)], [end, y(s.r - CHAMFER)], [end, y(next.r)]);
    } else if (next.r > s.r) {
      points.push([end, y(s.r)], [end, y(next.r - CHAMFER)], [end + CHAMFER, y(next.r)]);
    } else {
      points.push([end, y(s.r)]);
    }
  });
  return points;
}

/** Ponta de seta de cota com o vértice em (x, y), apontando na direção (dx, dy). */
const arrow = (x: number, y: number, dx: number, dy: number) =>
  `M${x - dx * 4 - dy * 2} ${y - dy * 4 - dx * 2}L${x} ${y}L${x - dx * 4 + dy * 2} ${y - dy * 4 + dx * 2}`;

// Cavacos: saem da ponta, sobem em arco e caem. dx/dy em unidades do viewBox.
const CHIPS = [
  { dx: 15, dy: -17, spin: 420, delay: 0, tone: "is-straw" },
  { dx: 25, dy: -9, spin: -380, delay: 0.13, tone: "is-blue" },
  { dx: 9, dy: -22, spin: 520, delay: 0.27, tone: "is-amber" },
  { dx: 21, dy: -14, spin: -460, delay: 0.38, tone: "is-straw" },
  { dx: 30, dy: -6, spin: 340, delay: 0.5, tone: "is-amber" },
  { dx: 13, dy: -13, spin: -520, delay: 0.62, tone: "is-blue" },
];

export default function MachinedPart({ seed, total, completed, running = false }: MachinedPartProps) {
  const count = Math.max(1, Math.min(MAX_SEGMENTS, total));
  const segments = useMemo(() => buildProfile(seed, count), [seed, count]);
  const cut = total ? Math.min(count, Math.floor((Math.min(completed, total) / total) * count)) : 0;

  // Só anima o trecho recém-usinado; ao trocar de módulo o estado é reaplicado sem animação.
  // Antes da pintura: o trecho novo não pode aparecer pronto nem por um quadro.
  const previous = useRef({ seed, cut });
  const [cycle, setCycle] = useState<{ index: number; t: number } | null>(null);
  useLayoutEffect(() => {
    const before = previous.current;
    previous.current = { seed, cut };
    if (before.seed !== seed) {
      setCycle(null);
      return;
    }
    if (cut <= before.cut || prefersReducedMotion()) return;
    const index = cut - 1;
    setCycle({ index, t: 0 });
    let frame = 0;
    let start: number | null = null;
    const tick = (now: number) => {
      if (start === null) start = now;
      const t = (now - start) / CUT_MS;
      if (t >= 1) {
        setCycle(null);
        return;
      }
      setCycle({ index, t });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      setCycle(null);
    };
  }, [seed, cut]);

  // A peça só fica pronta quando a ferramenta termina o último trecho.
  const done = total > 0 && completed >= total && !cycle;
  const cutting = cycle?.index ?? null;
  const segment = cutting !== null ? segments[Math.min(cutting, count - 1)] : null;

  // Posição da ponta da ferramenta em cada fase do ciclo.
  let toolX = PARK_X;
  let toolY = STOCK_TOP - CLEARANCE;
  let feeding = false;
  let revealX: number | null = null;
  if (cycle && segment) {
    const { t } = cycle;
    const end = segment.x + segment.width;
    const surface = AXIS_Y - segment.r;
    if (t < APPROACH_END) {
      toolX = lerp(PARK_X, end, easeInOut(t / APPROACH_END));
    } else if (t < PLUNGE_END) {
      toolX = end;
      toolY = lerp(STOCK_TOP - CLEARANCE, surface, easeInOut((t - APPROACH_END) / (PLUNGE_END - APPROACH_END)));
    } else if (t < FEED_END) {
      toolX = lerp(end, segment.x, (t - PLUNGE_END) / (FEED_END - PLUNGE_END));
      toolY = surface;
      feeding = true;
    } else {
      const back = (t - FEED_END) / (1 - FEED_END);
      toolX = lerp(segment.x, PARK_X, easeInOut(Math.max(0, back - 0.25) / 0.75));
      toolY = lerp(surface, STOCK_TOP - CLEARANCE, easeInOut(Math.min(1, back / 0.25)));
    }
    // O tarugo só some onde a ponta já passou.
    revealX = t < PLUNGE_END ? end : feeding ? toolX : segment.x;
  }

  const rawUntil = (s: Segment, index: number) => {
    if (index === cutting) return revealX ?? s.x + s.width;
    return index < cut ? s.x : s.x + s.width;
  };

  const top = edgePoints(segments, -1);
  const bottom = edgePoints(segments, 1);
  const profile = `M${[...top, ...[...bottom].reverse()].map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join("L")}Z`;
  const big = segments.reduce((a, b) => (b.r > a.r ? b : a));
  const bigX = big.x + big.width / 2;
  const dimY = AXIS_Y + STOCK_R + 10;
  // Faces dos ressaltos: em vista lateral cada degrau aparece como uma aresta do tamanho do diâmetro maior.
  const shoulders = segments
    .slice(1)
    .map((s, index) => `M${s.x.toFixed(2)} ${AXIS_Y - Math.max(s.r, segments[index].r)}V${AXIS_Y + Math.max(s.r, segments[index].r)}`)
    .join("");

  const uid = useId().replace(/:/g, "");
  const id = (name: string) => `machined-${name}-${uid}`;
  const state = [
    "machined-part",
    done ? "is-done" : "",
    cycle ? "is-spinning-fast" : running ? "is-spinning" : "",
    feeding ? "is-feeding" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <figure className={state} aria-label={`Peça em usinagem: ${cut} de ${count} trechos torneados`}>
      <svg viewBox="0 -10 256 102" aria-hidden="true" focusable="false">
        <defs>
          {/* Aço torneado: reflexo estreito e forte, típico de superfície cilíndrica polida */}
          <linearGradient id={id("shade")} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" className="machined-shade-a" />
            <stop offset="0.16" className="machined-shade-b" />
            <stop offset="0.3" className="machined-shade-c" />
            <stop offset="0.44" className="machined-shade-b" />
            <stop offset="0.74" className="machined-shade-d" />
            <stop offset="1" className="machined-shade-a" />
          </linearGradient>
          {/* Tarugo bruto: laminado a quente, escuro e fosco */}
          <linearGradient id={id("raw")} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" className="machined-raw-a" />
            <stop offset="0.28" className="machined-raw-b" />
            <stop offset="0.62" className="machined-raw-c" />
            <stop offset="1" className="machined-raw-a" />
          </linearGradient>
          <linearGradient id={id("iron")} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" className="machined-iron-a" />
            <stop offset="0.3" className="machined-iron-b" />
            <stop offset="1" className="machined-iron-c" />
          </linearGradient>
          {/* Marcas finas do avanço da ferramenta */}
          <pattern id={id("marks")} width="1.3" height="4" patternUnits="userSpaceOnUse">
            <path d="M0.3 0V4" className="machined-mark" />
          </pattern>
          {/* Grão irregular da casca de laminação */}
          <pattern id={id("scale")} width="17" height="9" patternUnits="userSpaceOnUse">
            <path d="M1 2h4M9 1h6M4 6h3M11 7h5M0 8h2" className="machined-scale" />
          </pattern>
          <radialGradient id={id("glow")}>
            <stop offset="0" stopColor="#fff3c4" stopOpacity="0.95" />
            <stop offset="0.4" stopColor="#ff9a2e" stopOpacity="0.55" />
            <stop offset="1" stopColor="#ff5a1e" stopOpacity="0" />
          </radialGradient>
          <clipPath id={id("part")}>
            <path d={profile} />
            {segments.map((s, index) => {
              const until = rawUntil(s, index);
              return until > s.x ? <rect key={index} x={s.x} y={STOCK_TOP} width={until - s.x} height={STOCK_R * 2} /> : null;
            })}
          </clipPath>
        </defs>

        {/* Placa do torno: corpo, castanhas e parafusos que passam com o giro */}
        <rect fill={`url(#${id("iron")})`} className="machined-iron-edge" x="0" y={AXIS_Y - STOCK_R - 7} width="9" height={(STOCK_R + 7) * 2} rx="1.5" />
        <rect fill={`url(#${id("raw")})`} x="8" y={STOCK_TOP} width={LEFT - 7} height={STOCK_R * 2} />
        <g className="machined-chuck-bolts">
          {[0, 1, 2].map(n => (
            <circle key={n} cx="4.5" cy={AXIS_Y} r="1.5" style={{ animationDelay: `${n * -0.33}s` } as CSSProperties} className="machined-bolt" />
          ))}
        </g>
        <path fill={`url(#${id("iron")})`} className="machined-iron-edge" d={`M9 ${AXIS_Y - STOCK_R - 5}H${LEFT - 1}L${LEFT + 1} ${AXIS_Y - STOCK_R - 1}V${STOCK_TOP + 1}H9Z`} />
        <path fill={`url(#${id("iron")})`} className="machined-iron-edge" d={`M9 ${AXIS_Y + STOCK_R - 1}H${LEFT + 1}V${AXIS_Y + STOCK_R + 1}L${LEFT - 1} ${AXIS_Y + STOCK_R + 5}H9Z`} />

        {/* Contraponto: mangote e ponta rotativa encostada na face da peça */}
        <rect fill={`url(#${id("iron")})`} className="machined-iron-edge" x={RIGHT + 9} y={AXIS_Y - 7} width="9" height="14" rx="1" />
        <path fill={`url(#${id("shade")})`} className="machined-iron-edge" d={`M${RIGHT} ${AXIS_Y}L${RIGHT + 9} ${AXIS_Y - 5}V${AXIS_Y + 5}Z`} />

        {/* Eixo torneado: aço polido e marcas de avanço, com chanfro nas quinas */}
        <g clipPath={`url(#${id("part")})`}>
          {segments.map((s, index) => (
            <rect key={index} x={s.x} y={AXIS_Y - s.r} width={s.width + 0.5} height={s.r * 2} fill={`url(#${id("shade")})`} />
          ))}
          <rect x={LEFT} y={STOCK_TOP} width={LENGTH} height={STOCK_R * 2} fill={`url(#${id("marks")})`} />
        </g>
        <path className="machined-shoulders" d={shoulders} />
        <path className="machined-profile" d={profile} />

        {/* Tarugo ainda não usinado, com o perfil final tracejado por cima */}
        {segments.map((s, index) => {
          const until = rawUntil(s, index);
          if (until <= s.x) return null;
          const width = until - s.x;
          // Trechos brutos vizinhos formam um tarugo só: leve sobreposição apaga a emenda, e só as pontas têm face.
          const nextSegment = segments[index + 1];
          const joinsNext = until === s.x + s.width && nextSegment && rawUntil(nextSegment, index + 1) > nextSegment.x;
          const previousSegment = segments[index - 1];
          const joinsPrevious = previousSegment && rawUntil(previousSegment, index - 1) === previousSegment.x + previousSegment.width;
          const fillWidth = joinsNext ? width + 0.4 : width;
          const faces = `${joinsPrevious ? "" : `M${s.x} ${STOCK_TOP}V${AXIS_Y + STOCK_R}`}${joinsNext ? "" : `M${until} ${STOCK_TOP}V${AXIS_Y + STOCK_R}`}`;
          return (
            <g key={index}>
              <rect x={s.x} y={STOCK_TOP} width={fillWidth} height={STOCK_R * 2} fill={`url(#${id("raw")})`} />
              <rect x={s.x} y={STOCK_TOP} width={fillWidth} height={STOCK_R * 2} fill={`url(#${id("scale")})`} />
              <path className="machined-raw-edge" d={`M${s.x} ${STOCK_TOP}h${width}M${s.x} ${AXIS_Y + STOCK_R}h${width}${faces}`} />
              <path className="machined-target" d={`M${s.x} ${AXIS_Y - s.r}h${width}M${s.x} ${AXIS_Y + s.r}h${width}`} />
            </g>
          );
        })}

        {/* Giro: faixas de luz que atravessam o cilindro, recortadas pela silhueta da peça */}
        <g clipPath={`url(#${id("part")})`} className="machined-spin">
          {[0, 1, 2].map(n => (
            <rect key={n} x={LEFT} y={AXIS_Y - 1} width={LENGTH} height="2" style={{ animationDelay: `${n * -0.33}s` } as CSSProperties} />
          ))}
        </g>

        <path className="machined-axis" d={`M${LEFT - 8} ${AXIS_Y}H${RIGHT + 8}`} />

        {/* Ferramenta: suporte e inserto; a ponta é a origem do grupo */}
        {!done ? (
          <g className="machined-tool" transform={`translate(${toolX.toFixed(2)} ${toolY.toFixed(2)})`}>
            {feeding && (
              <>
                <circle className="machined-spark" r="7" fill={`url(#${id("glow")})`} />
                {CHIPS.map((chip, index) => (
                  <path
                    key={index}
                    className={`machined-chip ${chip.tone}`}
                    style={{ "--dx": `${chip.dx}px`, "--dy": `${chip.dy}px`, "--spin": `${chip.spin}deg`, animationDelay: `${chip.delay}s` } as CSSProperties}
                    d="M0 0q2 -3 4 -1q1 2 -1 2.4q-1.5 0 -1.2 -1.2"
                  />
                ))}
              </>
            )}
            <path fill={`url(#${id("iron")})`} className="machined-iron-edge" d="M-2 -6.5H9V-20H-2Z" />
            <path className="machined-insert" d="M0 0L-1 -7H6.5L6 -4.5Z" />
            <circle className="machined-insert-screw" cx="2.8" cy="-4.6" r="0.9" />
          </g>
        ) : null}

        {/* Cotas da peça acabada */}
        <g className="machined-dims">
          <path
            pathLength={1}
            d={
              `M${LEFT} ${AXIS_Y + STOCK_R + 6}V${dimY + 3}M${RIGHT} ${AXIS_Y + segments[count - 1].r + 2}V${dimY + 3}` +
              `M${LEFT} ${dimY}H${RIGHT}${arrow(LEFT, dimY, -1, 0)}${arrow(RIGHT, dimY, 1, 0)}`
            }
          />
          <text x={LEFT + LENGTH / 2} y={dimY + 9}>
            {Math.round(LENGTH / 2)} mm
          </text>
          <path pathLength={1} d={`M${bigX} ${AXIS_Y + big.r}V${AXIS_Y - STOCK_R - 4}${arrow(bigX, AXIS_Y - big.r, 0, -1)}${arrow(bigX, AXIS_Y + big.r, 0, 1)}`} />
          <text x={bigX + 3} y={AXIS_Y - STOCK_R - 1} className="is-left">
            Ø{big.r}
          </text>
        </g>
      </svg>
      <figcaption>
        <span>
          {done && (
            <svg viewBox="0 0 12 12" aria-hidden="true" focusable="false">
              <path d="M2.5 6.2l2.3 2.3 4.7-5" />
            </svg>
          )}
          {done ? "PEÇA CONCLUÍDA" : "PEÇA EM USINAGEM"}
        </span>
        <small>
          {cut}/{count} {count === 1 ? "trecho" : "trechos"}
        </small>
      </figcaption>
    </figure>
  );
}
