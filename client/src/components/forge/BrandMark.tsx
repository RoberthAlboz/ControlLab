import { useId } from "react";

/**
 * Monograma "C" da Control Lab: um arco de engrenagem aberto à direita (o C),
 * com dentes na borda externa e o eixo no centro, no degradê #8E0707 → #C4080C.
 * tone="inverse" pinta em #FFF6F6 para fundos vermelhos ou fotos.
 */
type BrandMarkProps = {
  size?: number;
  tone?: "default" | "inverse";
  className?: string;
  title?: string;
};

const START = 42; // graus; o vão do C fica entre 318° e 42° (lado direito)
const END = 318;
const TEETH = 7;
const TIP = 46;
const ROOT = 38;
const INNER = 22;
const HUB = 8.5;

const pt = (r: number, deg: number) => {
  const a = (deg * Math.PI) / 180;
  return `${(Math.cos(a) * r).toFixed(2)} ${(Math.sin(a) * r).toFixed(2)}`;
};

function buildPath() {
  const pitch = (END - START) / TEETH;
  let d = `M${pt(INNER, START)}L${pt(ROOT, START)}`;
  for (let i = 0; i < TEETH; i += 1) {
    const c = START + pitch * (i + 0.5);
    d += `A${ROOT} ${ROOT} 0 0 1 ${pt(ROOT, c - pitch * 0.27)}`;
    d += `L${pt(TIP, c - pitch * 0.17)}A${TIP} ${TIP} 0 0 1 ${pt(TIP, c + pitch * 0.17)}`;
    d += `L${pt(ROOT, c + pitch * 0.27)}`;
  }
  d += `A${ROOT} ${ROOT} 0 0 1 ${pt(ROOT, END)}L${pt(INNER, END)}`;
  d += `A${INNER} ${INNER} 0 1 0 ${pt(INNER, START)}Z`;
  return d;
}

export const BRAND_MARK_PATH = buildPath();
export const BRAND_MARK_HUB = HUB;

export default function BrandMark({ size = 40, tone = "default", className = "", title }: BrandMarkProps) {
  const gradientId = useId();
  const fill = tone === "inverse" ? "#fff6f6" : `url(#${gradientId})`;
  return (
    <svg
      className={`brand-mark-c ${className}`}
      width={size}
      height={size}
      viewBox="-50 -50 100 100"
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      <defs>
        <linearGradient id={gradientId} x1="-50" y1="-50" x2="50" y2="50" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#8e0707" />
          <stop offset="1" stopColor="#c4080c" />
        </linearGradient>
      </defs>
      <path d={BRAND_MARK_PATH} fill={fill} strokeLinejoin="round" />
      <circle r={HUB} fill={fill} />
    </svg>
  );
}
