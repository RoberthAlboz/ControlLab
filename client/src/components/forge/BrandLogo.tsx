/**
 * Logotipo Control Lab (manual de marca): "control" em preto, sólido, e "lab"
 * em vermelho manuscrito logo abaixo. Em fundo escuro (tone="inverse") as duas
 * partes ficam em #FFF6F6, como na variante para fundos escuros do manual.
 */
import BrandMark from "@/components/forge/BrandMark";

type BrandLogoProps = {
  tone?: "default" | "inverse";
  size?: "sm" | "md";
  className?: string;
  /** Mostra um símbolo à esquerda, como no logotipo principal. */
  withMark?: boolean;
  /** "c": monograma C criado para o app; "official": símbolo do manual de marca (extraído do PDF). */
  mark?: "c" | "official";
};

const OFFICIAL_SYMBOL = "/brand/simbolo-control-lab.svg";

export default function BrandLogo({ tone = "default", size = "md", className = "", withMark = false, mark = "c" }: BrandLogoProps) {
  const logo = (
    <span className={`brand-logo brand-logo-${tone} brand-logo-${size} ${withMark ? "" : className}`} role={withMark ? undefined : "img"} aria-label={withMark ? undefined : "Control Lab"}>
      <span className="brand-logo-control" aria-hidden="true">
        control
      </span>
      <span className="brand-logo-lab" aria-hidden="true">
        lab
      </span>
    </span>
  );
  if (!withMark) return logo;
  return (
    <span className={`brand-lockup brand-lockup-${size} ${className}`} role="img" aria-label="Control Lab">
      {mark === "official" ? (
        <img className="brand-symbol" src={OFFICIAL_SYMBOL} alt="" width={size === "sm" ? 36 : 48} height={size === "sm" ? 36 : 48} />
      ) : (
        <BrandMark size={size === "sm" ? 34 : 46} />
      )}
      {logo}
    </span>
  );
}
