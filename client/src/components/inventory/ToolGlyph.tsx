/**
 * Figuras dos itens do estoque. As mesmas silhuetas servem à lista, ao detalhe,
 * ao seletor do cadastro e ao painel de ferramentas (onde o contorno vira a
 * "sombra" pintada no painel). Cada parte tem um material; ao passar o mouse a
 * ferramenta faz o próprio movimento (workshop.css).
 */
import { useId } from "react";
import {
  ITEM_ICONS,
  type ItemIcon,
  type ItemType,
  type ItemUnit,
} from "@shared/inventory";

type Tone = "steel" | "dark" | "grip" | "gold" | "iron" | "raw";
type ToolPart = {
  d: string;
  /** Material; sem nada é aço polido. */
  tone?: Tone;
  /** Peça horizontal: o brilho corre na vertical, não na largura. */
  flatLying?: boolean;
  evenodd?: boolean;
  /** Parte que se mexe sozinha na animação da ferramenta. */
  move?: "slide" | "screw" | "a" | "b" | "spin" | "lid" | "feed";
};
/** `details`: traços claros (brilho); `lines`: traços escuros (gravação, roscas, serrilhado). */
export type ToolShape = { parts: ToolPart[]; details: string; lines?: string };

/* Paradas dos degradês: brilho estreito perto de uma borda, como numa peça cilíndrica. */
const TONES: Record<Tone, [number, string][]> = {
  steel: [[0, "#5f666b"], [0.26, "#dfe3e6"], [0.4, "#fbfcfc"], [0.62, "#aab1b6"], [1, "#596065"]],
  dark: [[0, "#1f2224"], [0.3, "#62686c"], [0.45, "#454a4e"], [1, "#191c1e"]],
  grip: [[0, "#6f0404"], [0.3, "#e0262a"], [0.45, "#c4080c"], [1, "#6a0404"]],
  gold: [[0, "#7a5a0c"], [0.3, "#f3d577"], [0.48, "#d4a52a"], [1, "#6f520a"]],
  iron: [[0, "#43484c"], [0.3, "#969da2"], [0.55, "#6d7378"], [1, "#373b3f"]],
  raw: [[0, "#4b5054"], [0.3, "#8d9296"], [0.6, "#6e7377"], [1, "#44494d"]],
};

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
    parts: [
      { d: "M26 10H34V46H26Z" },
      { d: "M25 46H35V100L30 114L25 100Z", tone: "gold" },
    ],
    details: "M28 12V44",
    lines: "M25 54L35 47M25 63L35 56M25 72L35 65M25 81L35 74M25 90L35 83M25 99L35 92M26 104L34 98",
  },
  caliper: {
    parts: [
      { d: "M34 8H42V114H34Z" },
      { d: "M34 12H12L5 18L12 24H34Z" },
      { d: "M42 12H50L54 15L50 18H42Z" },
      { d: "M30 40H47V64H30Z", tone: "iron", move: "slide" },
      { d: "M30 44H14L7 50L14 56H30Z", tone: "iron", move: "slide" },
      { d: "M47 42H52L55 45L52 48H47Z", tone: "iron", move: "slide" },
      { d: "M47 53H51V61H47Z", tone: "dark", move: "slide" },
    ],
    details: "M36 10V112",
    lines:
      "M37 70H42M38 74H42M37 78H42M38 82H42M37 86H42M38 90H42M37 94H42M38 98H42M37 102H42M37 28H42M38 32H42M37 36H42",
  },
  micrometer: {
    parts: [
      { d: "M30 14A26 26 0 0 0 30 66V58A18 18 0 0 1 30 22Z", tone: "grip" },
      { d: "M27 22H33V30H27Z" },
      { d: "M28 44H32V60H28Z", move: "screw" },
      { d: "M26 58H34V84H26Z" },
      { d: "M23 84H37V106H23Z", tone: "dark", move: "screw" },
      { d: "M26 106H34V114H26Z", tone: "iron", move: "screw" },
    ],
    details: "M25.5 86V104M28.5 86V104M31.5 86V104M34.5 86V104",
    lines: "M26 64H30M26 68H32M26 72H30M26 76H32M26 80H30",
  },
  wrench: {
    parts: [
      { d: "M16 10Q14 30 30 34Q46 30 44 10L38 6V20H22V6Z" },
      { d: "M25 32H35L34 92H26Z" },
      { d: `${RING(30, 102, 12)}${RING(30, 102, 6.5)}`, evenodd: true },
    ],
    details: "M28 38L28.5 88",
    lines: "M31 42V84",
  },
  allen: {
    parts: [
      { d: "M26 10H34V96Q34 102 40 102H52V110H40Q26 110 26 96Z", tone: "dark" },
    ],
    details: "M29 12V96Q29 106 40 106H50",
  },
  screwdriver: {
    parts: [
      { d: "M22 10Q22 6 26 6H34Q38 6 38 10V48Q38 54 34 56H26Q22 54 22 48Z", tone: "grip" },
      { d: "M26 56H34V61H26Z", tone: "dark" },
      { d: "M28 61H32V104H28Z" },
      { d: "M28 104H32L33 110V114H27V110Z" },
    ],
    details: "M25 12V44",
    lines: "M27 14V48M31 14V48M35 14V48",
  },
  pliers: {
    parts: [
      { d: "M26 49L14 110Q17 116 22 111L30 54Z", tone: "grip", move: "a" },
      { d: "M34 49L46 110Q43 116 38 111L30 54Z", tone: "grip", move: "b" },
      { d: "M30 6Q26 7 25 14L26 40L30 44Z", move: "b" },
      { d: "M30 6Q34 7 35 14L34 40L30 44Z", move: "a" },
      { d: RING(30, 45, 6.5), tone: "iron" },
      { d: RING(30, 45, 2), tone: "dark" },
    ],
    details: "",
    lines: "M26 14H34M26 18H34M26 22H34M26 26H34M30 7V40",
  },
  hammer: {
    parts: [
      { d: "M26 24H34V62H26Z" },
      { d: "M25 62H35V110Q30 116 25 110Z", tone: "grip" },
      { d: "M8 10H46L52 14V24H8Z", tone: "iron", flatLying: true },
    ],
    details: "M10 12.5H45",
    lines: "M25 70H35M25 76H35M25 82H35M25 88H35M25 94H35M25 100H35",
  },
  file: {
    parts: [
      { d: "M24 10H36V42Q36 46 34 46H26Q24 46 24 42Z", tone: "grip" },
      { d: "M25 46H35V50H25Z", tone: "dark" },
      { d: "M26 50H34V106L30 114L26 106Z", tone: "iron" },
    ],
    details: "M27 12V42",
    lines:
      "M26 54L34 58M26 60L34 64M26 66L34 70M26 72L34 76M26 78L34 82M26 84L34 88M26 90L34 94M26 96L34 100M34 54L26 58M34 60L26 64M34 66L26 70M34 72L26 76M34 78L26 82M34 84L26 88M34 90L26 94M34 96L26 100",
  },
  saw: {
    parts: [
      { d: "M39 16H43V96H39Z" },
      { d: "M16 10H44V16H22V96H44V102H16Z", tone: "grip" },
      { d: "M17 102H29V116Q23 119 17 116Z", tone: "dark" },
    ],
    details: "M18 12V100",
    lines:
      "M39 22L37 25L39 28L37 31L39 34L37 37L39 40L37 43L39 46L37 49L39 52L37 55L39 58L37 61L39 64L37 67L39 70L37 73L39 76L37 79L39 82L37 85L39 88L37 91",
  },
  square: {
    parts: [
      { d: "M20 10H30V98H20Z" },
      { d: "M20 98H52V110H20Z", tone: "dark", flatLying: true },
    ],
    details: "M23 101H49",
    lines:
      "M30 20H26M30 30H24M30 40H26M30 50H24M30 60H26M30 70H24M30 80H26M30 90H24",
  },
  bar: {
    parts: [
      { d: "M20 16Q30 9 40 16V106Q30 113 20 106Z", tone: "raw" },
      { d: "M20 16Q30 9 40 16Q30 23 20 16Z", flatLying: true },
    ],
    details: "M25 26V98",
  },
  pin: {
    parts: [
      { d: "M25 24H35V100L30 110L25 100Z" },
      { d: "M19 12H41V24H19Z", tone: "iron" },
    ],
    details: "M27 26V38",
    lines:
      "M25 40L35 44M25 46L35 50M25 52L35 56M25 58L35 62M25 64L35 68M25 70L35 74M25 76L35 80M25 82L35 86M25 88L35 92M25 94L35 98M26 12V24M34 12V24",
  },
  gear: {
    parts: [
      { d: "M28 10H32V24H28Z", tone: "dark" },
      { d: `${gear(30, 48, 24, 18, 10)}${RING(30, 48, 7)}`, evenodd: true, move: "spin" },
    ],
    details: "",
    lines: RING(30, 48, 12),
  },
  box: {
    parts: [
      { d: "M23 8H37V22H33V12H27V22H23Z", tone: "dark", move: "lid" },
      { d: "M11 36H49V108H11Z", tone: "grip" },
      { d: "M8 22H52V36H8Z", tone: "grip", move: "lid" },
      { d: "M18 32H24V42H18Z", tone: "steel" },
      { d: "M36 32H42V42H36Z", tone: "steel" },
      { d: "M20 56H40V72H20Z", tone: "steel", flatLying: true },
    ],
    details: "M14 40V104",
    lines: "M24 61H36M24 66H33",
  },
  machine: {
    parts: [
      { d: "M17 38H23V104H17Z" },
      { d: "M20 74H50V80H20Z", tone: "iron", flatLying: true },
      { d: "M8 104H52V114H8Z", tone: "iron", flatLying: true },
      { d: "M37 38H42V60H37Z", move: "feed" },
      { d: "M36 60H43V66L40 70H39L36 66Z", tone: "dark", move: "feed" },
      { d: "M48 24H56V27H48Z", tone: "dark" },
      { d: "M12 14H48V38H12Z", tone: "grip" },
    ],
    details: "M15 18H45",
    lines: "M15 32H30M26 106V112M34 106V112",
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

const gradientKey = (part: ToolPart) => `${part.tone ?? "steel"}${part.flatLying ? "-v" : ""}`;

/** `flat`: sem materiais, só a silhueta (a "sombra" pintada no painel). */
export function ToolSvg({
  shape,
  className,
  flat = false,
}: {
  shape: ToolShape;
  className: string;
  flat?: boolean;
}) {
  const uid = useId().replace(/:/g, "");
  // Só os degradês que esta figura usa: a lista e o seletor mostram dezenas delas.
  const used = flat ? [] : Array.from(new Set(shape.parts.map(gradientKey)));
  return (
    <g className={className}>
      {used.length > 0 && (
        <defs>
          {used.map(key => {
            const [tone, axis] = key.split("-");
            return (
              <linearGradient
                key={key}
                id={`${uid}-${key}`}
                x1="0"
                y1="0"
                x2={axis ? "0" : "1"}
                y2={axis ? "1" : "0"}
              >
                {TONES[tone as Tone].map(([offset, color]) => (
                  <stop key={offset} offset={offset} stopColor={color} />
                ))}
              </linearGradient>
            );
          })}
        </defs>
      )}
      {shape.parts.map((part, index) => (
        <path
          key={index}
          d={part.d}
          fillRule={part.evenodd ? "evenodd" : undefined}
          className={part.move ? `tool-move-${part.move}` : undefined}
          style={flat ? undefined : { fill: `url(#${uid}-${gradientKey(part)})` }}
        />
      ))}
      {shape.details && (
        <path d={shape.details} className="shadow-board-detail" />
      )}
      {shape.lines && (
        <path d={shape.lines} className="shadow-board-detail is-engraved" />
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
      data-icon={icon}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      <ToolSvg shape={SHAPES[icon]} className="tool-glyph-body" />
    </svg>
  );
}
