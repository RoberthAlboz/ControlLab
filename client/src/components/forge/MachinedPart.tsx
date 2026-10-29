import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from "react";

/**
 * Eixo escalonado que vai sendo torneado conforme as etapas do módulo são
 * concluídas: cada etapa usina um trecho do tarugo até o diâmetro final, com o
 * inserto passando e soltando cavaco. O perfil é derivado do id do módulo, então
 * cada módulo "fabrica" a sua própria peça. Concluído, aparecem as cotas.
 */
type MachinedPartProps = {
  seed: string;
  total: number;
  completed: number;
};

const LENGTH = 220;
const STOCK_R = 26;
const AXIS_Y = 40;
const LEFT = 18;
const MAX_SEGMENTS = 8;

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

/** Ponta de seta de cota com o vértice em (x, y), apontando na direção (dx, dy). */
const arrow = (x: number, y: number, dx: number, dy: number) =>
  `M${x - dx * 4 - dy * 2} ${y - dy * 4 - dx * 2}L${x} ${y}L${x - dx * 4 + dy * 2} ${y - dy * 4 + dx * 2}`;

export default function MachinedPart({ seed, total, completed }: MachinedPartProps) {
  const count = Math.max(1, Math.min(MAX_SEGMENTS, total));
  const segments = useMemo(() => buildProfile(seed, count), [seed, count]);
  const cut = total ? Math.min(count, Math.floor((Math.min(completed, total) / total) * count)) : 0;
  const done = total > 0 && completed >= total;

  // Só anima o trecho recém-usinado; ao trocar de módulo o estado é reaplicado sem animação.
  const previous = useRef({ seed, cut });
  const [cutting, setCutting] = useState<number | null>(null);
  useEffect(() => {
    const before = previous.current;
    previous.current = { seed, cut };
    if (before.seed !== seed || cut <= before.cut) return;
    setCutting(cut - 1);
    const timer = window.setTimeout(() => setCutting(null), 1500);
    return () => window.clearTimeout(timer);
  }, [seed, cut]);

  const profile =
    `M${LEFT} ${AXIS_Y}` +
    segments.map(s => `V${AXIS_Y - s.r}H${(s.x + s.width).toFixed(2)}`).join("") +
    `V${AXIS_Y}` +
    [...segments].reverse().map(s => `V${AXIS_Y + s.r}H${s.x.toFixed(2)}`).join("") +
    "Z";
  const big = segments.reduce((a, b) => (b.r > a.r ? b : a));
  const bigX = big.x + big.width / 2;
  const right = LEFT + LENGTH;
  const dimY = AXIS_Y + STOCK_R + 10;
  // Faces dos ressaltos: em vista lateral cada degrau aparece como uma aresta do tamanho do diâmetro maior.
  const shoulders = segments
    .slice(1)
    .map((s, index) => `M${s.x.toFixed(2)} ${AXIS_Y - Math.max(s.r, segments[index].r)}V${AXIS_Y + Math.max(s.r, segments[index].r)}`)
    .join("");

  const uid = useId().replace(/:/g, "");
  const hatchId = `machined-hatch-${uid}`;
  const shadeId = `machined-shade-${uid}`;

  return (
    <figure className={`machined-part${done ? " is-done" : ""}`} aria-label={`Peça em usinagem: ${cut} de ${count} trechos torneados`}>
      <svg viewBox="0 0 256 92" aria-hidden="true" focusable="false">
        <defs>
          <pattern id={hatchId} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <path d="M0 0V5" className="machined-hatch-line" />
          </pattern>
          {/* Sombreamento cilíndrico: cada trecho ganha o próprio brilho de peça torneada */}
          <linearGradient id={shadeId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" className="machined-shade-edge" />
            <stop offset="0.28" className="machined-shade-light" />
            <stop offset="0.62" className="machined-shade-mid" />
            <stop offset="1" className="machined-shade-edge" />
          </linearGradient>
        </defs>

        {/* Placa do torno e ponta rotativa encostada na face da peça */}
        <path className="machined-chuck" d={`M4 ${AXIS_Y - STOCK_R - 6}h${LEFT - 6}v${(STOCK_R + 6) * 2}H4Z`} />
        <path className="machined-chuck" d={`M${right} ${AXIS_Y}L${right + 8} ${AXIS_Y - 5}H${right + 18}V${AXIS_Y + 5}H${right + 8}Z`} />

        {segments.map((s, index) => (
          <rect key={index} x={s.x} y={AXIS_Y - s.r} width={s.width} height={s.r * 2} fill={`url(#${shadeId})`} />
        ))}
        <path className="machined-shoulders" d={shoulders} />
        <path className="machined-profile" d={profile} />

        {/* Sobremetal ainda não usinado, acima e abaixo de cada trecho */}
        {segments.map((s, index) => {
          if (index < cut && index !== cutting) return null;
          const height = STOCK_R - s.r;
          return (
            <g key={index} className={`machined-stock${index === cutting ? " is-cutting" : ""}`}>
              <rect x={s.x} y={AXIS_Y - STOCK_R} width={s.width} height={height} fill={`url(#${hatchId})`} />
              <rect x={s.x} y={AXIS_Y + s.r} width={s.width} height={height} fill={`url(#${hatchId})`} />
            </g>
          );
        })}

        <path className="machined-axis" d={`M${LEFT - 8} ${AXIS_Y}H${LEFT + LENGTH + 8}`} />

        {cutting !== null && (
          <g className="machined-tool" style={{ "--from": `${segments[cutting].x + segments[cutting].width}px`, "--to": `${segments[cutting].x}px` } as CSSProperties}>
            <path d={`M0 ${AXIS_Y - segments[cutting].r}l-4 -7h10z`} className="machined-insert" />
            {[0, 1, 2, 3].map(chip => (
              <path key={chip} className="machined-chip" style={{ animationDelay: `${0.15 + chip * 0.22}s` }} d={`M0 ${AXIS_Y - segments[cutting].r - 4}q3 -4 6 -1q-2 4 -5 2`} />
            ))}
          </g>
        )}

        {/* Cotas da peça acabada */}
        <g className="machined-dims">
          <path
            d={
              `M${LEFT} ${AXIS_Y + segments[0].r + 2}V${dimY + 3}M${right} ${AXIS_Y + segments[count - 1].r + 2}V${dimY + 3}` +
              `M${LEFT} ${dimY}H${right}${arrow(LEFT, dimY, -1, 0)}${arrow(right, dimY, 1, 0)}`
            }
          />
          <text x={LEFT + LENGTH / 2} y={dimY + 9}>
            {Math.round(LENGTH / 2)} mm
          </text>
          <path d={`M${bigX} ${AXIS_Y + big.r}V${AXIS_Y - STOCK_R - 4}${arrow(bigX, AXIS_Y - big.r, 0, -1)}${arrow(bigX, AXIS_Y + big.r, 0, 1)}`} />
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
