/**
 * Indicador de carregamento com engrenagens entrelaçadas (identidade ForgeLab).
 * O movimento é desligado automaticamente com `prefers-reduced-motion`.
 */
type GearLoaderProps = {
  label?: string;
  size?: "sm" | "md" | "lg";
  inline?: boolean;
};

function GearShape({ teeth, radius, className }: { teeth: number; radius: number; className: string }) {
  const outer = radius;
  const inner = radius * 0.78;
  const points: string[] = [];
  const step = (Math.PI * 2) / teeth;
  for (let index = 0; index < teeth; index += 1) {
    const angle = index * step;
    const toothHalf = step * 0.22;
    const corners = [
      [inner, angle - step / 2 + toothHalf * 0.4],
      [outer, angle - toothHalf],
      [outer, angle + toothHalf],
      [inner, angle + step / 2 - toothHalf * 0.4],
    ];
    for (const [r, a] of corners) points.push(`${(Math.cos(a) * r).toFixed(2)},${(Math.sin(a) * r).toFixed(2)}`);
  }
  return (
    <g className={className}>
      <polygon points={points.join(" ")} />
      <circle r={radius * 0.32} className="gear-hole" />
    </g>
  );
}

export default function GearLoader({ label = "Carregando…", size = "md", inline = false }: GearLoaderProps) {
  return (
    <div className={`gear-loader gear-loader-${size} ${inline ? "is-inline" : ""}`} role="status" aria-live="polite">
      <svg viewBox="-40 -30 80 60" aria-hidden="true" focusable="false">
        <g transform="translate(-10 0)">
          <GearShape teeth={10} radius={18} className="gear-a" />
        </g>
        <g transform="translate(17.5 -10.5)">
          <GearShape teeth={7} radius={12} className="gear-b" />
        </g>
      </svg>
      <span>{label}</span>
    </div>
  );
}
