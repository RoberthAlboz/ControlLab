/**
 * Geometria de engrenagens de dentes retos desenhadas como peça técnica.
 * Todas as engrenagens de um trem têm o mesmo módulo e engrenam de verdade:
 * posição, fase e relação de cada uma derivam da engrenagem "mãe".
 */
export type GearSpec = { teeth: number; parent?: number; angle?: number; accent?: boolean };
export type Gear = GearSpec & { x: number; y: number; phase: number; ratio: number; pitch: number; path: string };

const polar = (r: number, a: number) => `${(Math.cos(a) * r).toFixed(2)} ${(Math.sin(a) * r).toFixed(2)}`;
const circle = (r: number, cx = 0, cy = 0) =>
  `M${(cx + r).toFixed(2)} ${cy.toFixed(2)}A${r} ${r} 0 1 0 ${(cx - r).toFixed(2)} ${cy.toFixed(2)}A${r} ${r} 0 1 0 ${(cx + r).toFixed(2)} ${cy.toFixed(2)}Z`;

/** Contorno da engrenagem centrado na origem; use com `fillRule="evenodd"` para vazar furos e janelas. */
export function gearPath(teeth: number, module: number): string {
  const pitch = (module * teeth) / 2;
  const tip = pitch + module;
  const root = pitch - 1.25 * module;
  const step = (Math.PI * 2) / teeth;
  let d = "";
  for (let i = 0; i < teeth; i += 1) {
    const a = i * step;
    d += `${i === 0 ? "M" : "L"}${polar(root, a - step * 0.5)}`;
    d += `A${root} ${root} 0 0 1 ${polar(root, a - step * 0.3)}`;
    d += `L${polar(pitch, a - step * 0.24)}L${polar(tip, a - step * 0.14)}`;
    d += `A${tip} ${tip} 0 0 1 ${polar(tip, a + step * 0.14)}`;
    d += `L${polar(pitch, a + step * 0.24)}L${polar(root, a + step * 0.3)}`;
    d += `A${root} ${root} 0 0 1 ${polar(root, a + step * 0.5)}`;
  }
  d += "Z";

  // Furo do eixo, janelas entre os raios e furos de parafuso (evenodd vira vazado).
  const bore = Math.max(module * 1.3, pitch * 0.12);
  d += circle(bore);
  if (teeth >= 16) {
    const spokes = teeth >= 30 ? 6 : teeth >= 20 ? 5 : 4;
    const inner = bore * 2.3;
    const outer = root - module * 1.5;
    const half = Math.PI / spokes - Math.min(0.32, (module * 1.1) / inner);
    const halfOuter = Math.PI / spokes - (module * 1.1) / outer;
    for (let s = 0; s < spokes; s += 1) {
      const c = (s + 0.5) * ((Math.PI * 2) / spokes);
      d += `M${polar(inner, c - half)}L${polar(outer, c - halfOuter)}`;
      d += `A${outer} ${outer} 0 0 1 ${polar(outer, c + halfOuter)}`;
      d += `L${polar(inner, c + half)}A${inner} ${inner} 0 0 0 ${polar(inner, c - half)}Z`;
    }
    const boltRing = (bore + inner) / 2;
    for (let b = 0; b < spokes; b += 1) {
      const a = (b / spokes) * Math.PI * 2;
      d += circle(module * 0.38, Math.cos(a) * boltRing, Math.sin(a) * boltRing);
    }
  } else {
    for (let b = 0; b < 3; b += 1) {
      const a = (b / 3) * Math.PI * 2 + Math.PI / 6;
      const ring = (bore + root) / 2;
      d += circle(module * 0.45, Math.cos(a) * ring, Math.sin(a) * ring);
    }
  }
  return d;
}

/**
 * Monta o trem: a primeira engrenagem fica na origem; cada filha encosta na mãe
 * no ângulo pedido (graus), girando no sentido oposto na relação de dentes.
 */
export function buildTrain(specs: GearSpec[], module: number): Gear[] {
  const gears: Gear[] = [];
  for (const spec of specs) {
    const pitch = (module * spec.teeth) / 2;
    const step = (Math.PI * 2) / spec.teeth;
    if (spec.parent === undefined) {
      gears.push({ ...spec, x: 0, y: 0, phase: 0, ratio: 1, pitch, path: gearPath(spec.teeth, module) });
      continue;
    }
    const parent = gears[spec.parent];
    const theta = ((spec.angle ?? 0) * Math.PI) / 180;
    const distance = parent.pitch + pitch;
    // Fração do passo em que o dente da mãe está na linha de centros; a filha precisa de um vão ali.
    const parentStep = (Math.PI * 2) / parent.teeth;
    const fraction = (theta - parent.phase) / parentStep;
    gears.push({
      ...spec,
      x: parent.x + Math.cos(theta) * distance,
      y: parent.y + Math.sin(theta) * distance,
      phase: theta + Math.PI - step * (0.5 - fraction),
      ratio: -parent.ratio * (parent.teeth / spec.teeth),
      pitch,
      path: gearPath(spec.teeth, module),
    });
  }
  return gears;
}

/** Caixa que contém o trem inteiro (círculos de topo + folga). */
export function trainBounds(train: Gear[], module: number, pad = 0) {
  return train.reduce(
    (box, g) => {
      const r = g.pitch + module + pad;
      return { minX: Math.min(box.minX, g.x - r), minY: Math.min(box.minY, g.y - r), maxX: Math.max(box.maxX, g.x + r), maxY: Math.max(box.maxY, g.y + r) };
    },
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
  );
}

/** Radianos → graus com 3 casas, para atributos `rotate()`. */
export const deg = (rad: number) => ((rad * 180) / Math.PI).toFixed(3);
