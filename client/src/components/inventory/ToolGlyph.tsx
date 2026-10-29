/**
 * Figuras dos itens do estoque. As mesmas silhuetas servem à lista, ao detalhe,
 * ao seletor do cadastro e ao painel de ferramentas (onde o contorno vira a
 * "sombra" pintada no painel).
 */
import {
  ITEM_ICONS,
  type ItemIcon,
  type ItemType,
  type ItemUnit,
} from "@shared/inventory";

type ToolPart = { d: string; stroke?: number; evenodd?: boolean };
export type ToolShape = { parts: ToolPart[]; details: string };

/* Silhuetas desenhadas numa caixa 60 × 120, penduradas no gancho em (30, 8). */
const RING = (cx: number, cy: number, r: number) =>
  `M${cx + r} ${cy}A${r} ${r} 0 1 0 ${cx - r} ${cy}A${r} ${r} 0 1 0 ${cx + r} ${cy}Z`;

function gear(
  cx: number,
  cy: number,
  outer: number,
  inner: number,
  teeth: number
) {
  const points: string[] = [];
  for (let i = 0; i < teeth * 4; i++) {
    const angle = (i / (teeth * 4)) * Math.PI * 2;
    const r = i % 4 < 2 ? outer : inner;
    points.push(
      `${(cx + r * Math.cos(angle)).toFixed(1)} ${(cy + r * Math.sin(angle)).toFixed(1)}`
    );
  }
  return `M${points.join("L")}Z`;
}

export const SHAPES: Record<ItemIcon, ToolShape> = {
  drill: {
    parts: [{ d: "M25 12H35V50L36 52V102L30 114L24 102V52L25 50Z" }],
    details: "M24 58L36 52M24 68L36 62M24 78L36 72M24 88L36 82M24 98L36 92",
  },
  caliper: {
    parts: [
      { d: "M34 8H42V114H34Z" },
      { d: "M34 12H12L5 18L12 24H34Z" },
      { d: "M42 12H50L54 15L50 18H42Z" },
      { d: "M30 40H47V64H30Z" },
      { d: "M30 44H14L7 50L14 56H30Z" },
      { d: "M47 42H52L55 45L52 48H47Z" },
    ],
    details:
      "M37 70H42M38 74H42M37 78H42M38 82H42M37 86H42M38 90H42M37 94H42M38 98H42M37 102H42",
  },
  micrometer: {
    parts: [
      { d: "M30 18A20 20 0 0 0 30 62", stroke: 8 },
      { d: "M27 20H33V28H27Z" },
      { d: "M28 44H32V60H28Z" },
      { d: "M26 60H34V84H26Z" },
      { d: "M23 84H37V106H23Z" },
      { d: "M26 106H34V114H26Z" },
    ],
    details: "M23 88H37M23 92H37M23 96H37M23 100H37M30 62V82",
  },
  wrench: {
    parts: [
      { d: "M17 12Q17 34 30 34Q43 34 43 12L37 6V20H23V6Z" },
      { d: "M26 32H34V94H26Z" },
      { d: `${RING(30, 102, 11)}${RING(30, 102, 6)}`, evenodd: true },
    ],
    details: "M30 42V84",
  },
  allen: {
    parts: [{ d: "M30 10V96Q30 106 40 106H50", stroke: 7 }],
    details: "",
  },
  screwdriver: {
    parts: [
      { d: "M23 10H37V50Q37 55 32 56H28Q23 55 23 50Z" },
      { d: "M28 56H32V104H28Z" },
      { d: "M27 104H33L32 114H28Z" },
    ],
    details: "M27 16V48M33 16V48",
  },
  pliers: {
    parts: [
      { d: "M25 14Q30 4 35 14L34 40H26Z" },
      { d: RING(30, 45, 6) },
      { d: "M26 49L15 110Q18 115 22 111L30 52Z" },
      { d: "M34 49L45 110Q42 115 38 111L30 52Z" },
    ],
    details: "M30 12V38",
  },
  hammer: {
    parts: [
      { d: "M8 12H46L52 16V24H8Z" },
      { d: "M26 24H34V112Q30 116 26 112Z" },
    ],
    details: "M30 34V104",
  },
  file: {
    parts: [
      { d: "M24 10H36V42Q36 44 34 44H26Q24 44 24 42Z" },
      { d: "M25 44H35V49H25Z" },
      { d: "M26 49H34V106L30 114L26 106Z" },
    ],
    details:
      "M26 56L34 60M26 64L34 68M26 72L34 76M26 80L34 84M26 88L34 92M26 96L34 100",
  },
  saw: {
    parts: [
      { d: "M16 10H44V16H22V96H44V102H16Z" },
      { d: "M39 16H43V96H39Z" },
      { d: "M17 102H29V116Q23 119 17 116Z" },
    ],
    details:
      "M39 22L37 25L39 28L37 31L39 34L37 37L39 40L37 43L39 46L37 49L39 52L37 55L39 58L37 61L39 64L37 67L39 70L37 73L39 76L37 79L39 82L37 85L39 88L37 91",
  },
  square: {
    parts: [{ d: "M20 10H30V100H52V110H20Z" }],
    details:
      "M30 20H26M30 30H24M30 40H26M30 50H24M30 60H26M30 70H24M30 80H26M30 90H24M40 110V106M50 110V104",
  },
  bar: {
    parts: [{ d: "M20 16Q30 9 40 16V106Q30 113 20 106Z" }],
    details: "M20 16Q30 23 40 16M24 30V96",
  },
  pin: {
    parts: [{ d: "M20 12H40V22H20Z" }, { d: "M25 22H35V100L30 110L25 100Z" }],
    details:
      "M25 40L35 44M25 50L35 54M25 60L35 64M25 70L35 74M25 80L35 84M25 90L35 94",
  },
  gear: {
    parts: [
      { d: "M28 10H32V22H28Z" },
      { d: `${gear(30, 48, 24, 18, 10)}${RING(30, 48, 7)}`, evenodd: true },
    ],
    details: RING(30, 48, 12),
  },
  box: {
    parts: [
      { d: "M27 8H33V22H27Z" },
      { d: "M8 22H52V34H8Z" },
      { d: "M11 34H49V108H11Z" },
    ],
    details: "M20 56H40V72H20ZM26 22V34M34 22V34",
  },
  machine: {
    parts: [
      { d: "M12 14H48V38H12Z" },
      { d: "M16 38H23V104H16Z" },
      { d: "M37 38H42V60H37Z" },
      { d: "M23 72H48V78H23Z" },
      { d: "M8 104H52V114H8Z" },
    ],
    details: "M48 24H55M18 20H40M38 60L39.5 66L41 60",
  },
};

export function isItemIcon(value: unknown): value is ItemIcon {
  return (
    typeof value === "string" &&
    (ITEM_ICONS as readonly string[]).includes(value)
  );
}

/** Figura automática: pela descrição, depois pelo tipo do item. */
export function guessIcon(item: {
  name: string;
  code: string;
  itemType: ItemType;
  unit?: ItemUnit;
}): ItemIcon {
  const text = `${item.name} ${item.code}`.toLowerCase();
  if (/broca|fresa|macho|alarg|inserto/.test(text)) return "drill";
  if (/paqu/.test(text)) return "caliper";
  if (/micr[oô]m/.test(text)) return "micrometer";
  if (/martel|marreta/.test(text)) return "hammer";
  if (/allen|hexagon/.test(text)) return "allen";
  if (/fenda|phillips|philips|torx/.test(text)) return "screwdriver";
  if (/alicate/.test(text)) return "pliers";
  if (/\blima\b/.test(text)) return "file";
  if (/serra|\barco\b/.test(text)) return "saw";
  if (/esquadro|r[ée]gua|trena/.test(text)) return "square";
  if (/engren/.test(text)) return "gear";
  if (/pino|parafuso|porca|rebite/.test(text)) return "pin";
  if (/barra|tarugo|chapa|perfil/.test(text)) return "bar";
  if (/chave/.test(text)) return "wrench";
  if (item.itemType === "machine") return "machine";
  if (item.itemType === "material") return "bar";
  if (item.itemType === "part") return "pin";
  if (item.unit === "CX" || item.unit === "JG") return "box";
  return "wrench";
}

export function iconFor(item: {
  icon?: string | null;
  name: string;
  code: string;
  itemType: ItemType;
  unit?: ItemUnit;
}): ItemIcon {
  return isItemIcon(item.icon) ? item.icon : guessIcon(item);
}

export function ToolSvg({
  shape,
  className,
}: {
  shape: ToolShape;
  className: string;
}) {
  return (
    <g className={className}>
      {shape.parts.map((part, index) =>
        part.stroke ? (
          <path
            key={index}
            d={part.d}
            fill="none"
            strokeWidth={part.stroke}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : (
          <path
            key={index}
            d={part.d}
            fillRule={part.evenodd ? "evenodd" : undefined}
          />
        )
      )}
      {shape.details && (
        <path d={shape.details} className="shadow-board-detail" />
      )}
    </g>
  );
}

/** Figura avulsa (lista, detalhe, seletor). */
export function ToolGlyph({
  icon,
  className = "",
  title,
}: {
  icon: ItemIcon;
  className?: string;
  title?: string;
}) {
  return (
    <svg
      viewBox="0 0 60 122"
      className={`tool-glyph ${className}`}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      <ToolSvg shape={SHAPES[icon]} className="tool-glyph-body" />
    </svg>
  );
}
