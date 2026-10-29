/**
 * Conclusão de módulo como marcação por punção, vista de cima: a matriz desce
 * sobre a chapa, crava o selo (anel serrilhado + ✓) e sobe, soltando cavacos.
 * Tudo em CSS (workshop.css, "Punção"); com "reduzir movimento" o selo já
 * aparece cravado, sem matriz nem cavacos.
 */
const SERRATION = Array.from({ length: 32 }, (_, i) => {
  const a = (i / 32) * Math.PI * 2;
  const p = (r: number) => `${(Math.cos(a) * r).toFixed(2)} ${(Math.sin(a) * r).toFixed(2)}`;
  return `M${p(17.2)}L${p(19.4)}`;
}).join("");

const BOLTS: Array<[number, number]> = [
  [-29, -25],
  [29, -25],
  [-29, 25],
  [29, 25],
];

export default function StampMark() {
  return (
    <div className="stamp-mark" aria-hidden="true">
      <svg viewBox="-40 -36 80 72" focusable="false">
        <rect className="stamp-plate" x={-35} y={-31} width={70} height={62} rx={4} />
        <path className="stamp-plate-grain" d="M-31 -18H31M-31 -6H31M-31 6H31M-31 18H31" />
        {BOLTS.map(([x, y]) => (
          <circle key={`${x}:${y}`} className="stamp-plate-bolt" cx={x} cy={y} r={1.8} />
        ))}

        <g className="stamp-imprint">
          <circle className="stamp-imprint-ring" r={20.5} />
          <path className="stamp-imprint-serration" d={SERRATION} />
          <circle className="stamp-imprint-ring is-inner" r={15.6} />
          <path className="stamp-imprint-check" d="M-7.6 0.4L-2.4 5.6L8.4 -5.6" />
        </g>

        <circle className="stamp-die-shadow" r={22} />
        <g className="stamp-die">
          <circle className="stamp-die-body" r={22} />
          <circle className="stamp-die-chamfer" r={18.5} />
          <circle className="stamp-die-core" r={7} />
        </g>
      </svg>
      <span className="stamp-chips">
        {Array.from({ length: 8 }, (_, index) => (
          <i key={index} />
        ))}
      </span>
    </div>
  );
}
