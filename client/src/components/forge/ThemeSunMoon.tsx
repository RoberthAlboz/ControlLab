import { useId } from "react";

/**
 * Ícone do botão de tema: sol no modo claro, lua no escuro. Na troca, os raios
 * recolhem girando e uma sombra desliza sobre o disco até formar o crescente
 * (e o inverso ao voltar). O rótulo acessível continua no botão que envolve o ícone.
 */
type ThemeSunMoonProps = {
  dark: boolean;
  size?: number;
};

const SUN_RAYS = Array.from({ length: 8 }, (_, i) => {
  const a = (i / 8) * Math.PI * 2;
  const p = (r: number) => `${(Math.cos(a) * r).toFixed(2)} ${(Math.sin(a) * r).toFixed(2)}`;
  return `M${p(7.4)}L${p(10)}`;
}).join("");

export default function ThemeSunMoon({ dark, size = 20 }: ThemeSunMoonProps) {
  const maskId = useId();

  return (
    <svg
      className={`theme-sunmoon${dark ? " is-dark" : ""}`}
      width={size}
      height={size}
      viewBox="-12 -12 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <mask id={maskId}>
        <rect x={-12} y={-12} width={24} height={24} fill="#fff" />
        {/* A sombra que recorta o crescente: fora do disco no sol, sobre ele na lua. */}
        <circle className="theme-sunmoon-shadow" r={6} fill="#000" />
      </mask>
      <g className="theme-sunmoon-rays">
        <path d={SUN_RAYS} />
      </g>
      <circle className="theme-sunmoon-disc" r={5} mask={`url(#${maskId})`} />
    </svg>
  );
}
