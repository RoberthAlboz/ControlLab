import { useEffect, useRef } from "react";

/**
 * Ilustração da tela de login: quatro formas da marca com rosto. Os olhos seguem o cursor,
 * a expressão muda com o estado do formulário e, ao digitar a senha, elas fecham os olhos.
 * É decorativa (aria-hidden); nada nela é necessário para entrar.
 */
export type AuthMood = "idle" | "sad" | "hiding" | "happy";

type EyeProps = { cx: number; cy: number; r?: number };

function Eye({ cx, cy, r = 6.5 }: EyeProps) {
  return (
    <g className="ac-eye">
      <circle className="ac-eye-white" cx={cx} cy={cy} r={r} />
      <circle className="ac-pupil" cx={cx} cy={cy} r={r * 0.5} />
      {/* Pálpebra fechada: aparece no lugar do olho quando a pessoa digita a senha. */}
      <path className="ac-lid" d={`M${cx - r} ${cy} q${r} ${r * 0.9} ${r * 2} 0`} />
    </g>
  );
}

type MouthProps = { x: number; y: number; w?: number; tone: "light" | "dark" };

/** Boca: sorriso, reta ou triste, conforme o humor da cena. */
function Mouth({ x, y, w = 22, tone }: MouthProps) {
  const half = w / 2;
  return (
    <g className={`ac-mouth is-${tone}`}>
      <path className="ac-m-idle" d={`M${x - half} ${y} q${half} ${half * 0.7} ${w} 0`} />
      <path className="ac-m-sad" d={`M${x - half} ${y + 5} q${half} ${-half * 0.7} ${w} 0`} />
      <path className="ac-m-flat" d={`M${x - half * 0.6} ${y + 2} h${w * 0.6}`} />
    </g>
  );
}

export default function AuthCharacters({ mood }: { mood: AuthMood }) {
  const ref = useRef<SVGSVGElement>(null);

  // Os olhos acompanham o cursor: cada pupila se desloca até 3 unidades na direção dele.
  useEffect(() => {
    const svg = ref.current;
    if (!svg || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    const onMove = (event: PointerEvent) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const box = svg.getBoundingClientRect();
        const dx = (event.clientX - (box.left + box.width / 2)) / Math.max(box.width, 1);
        const dy = (event.clientY - (box.top + box.height / 2)) / Math.max(box.height, 1);
        svg.style.setProperty("--lx", String(Math.max(-1, Math.min(1, dx * 2.2))));
        svg.style.setProperty("--ly", String(Math.max(-1, Math.min(1, dy * 2.2))));
      });
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <svg ref={ref} className={`auth-characters is-${mood}`} viewBox="0 0 400 360" aria-hidden="true" focusable="false">
      <g className="ac-tall">
        <rect x="100" y="12" width="153" height="331" fill="#8e0707" />
        <Eye cx={162} cy={42} />
        <Eye cx={196} cy={42} />
        <Mouth x={180} y={64} w={16} tone="light" />
      </g>
      <g className="ac-mid">
        <rect x="210" y="108" width="93" height="235" fill="#1c1517" />
        <Eye cx={242} cy={136} />
        <Eye cx={272} cy={136} />
        <Mouth x={257} y={158} w={14} tone="light" />
      </g>
      <g className="ac-pill">
        <path d="M279 343 V224 a53 53 0 0 1 106 0 V343 Z" fill="#ff4d52" />
        <Eye cx={310} cy={214} r={5} />
        <Eye cx={338} cy={214} r={5} />
        <Mouth x={324} y={240} w={16} tone="dark" />
      </g>
      <g className="ac-half">
        <path d="M0 343 a127.5 131 0 0 1 255 0 Z" fill="#c4080c" />
        <Eye cx={92} cy={296} />
        <Eye cx={130} cy={296} />
        <Mouth x={111} y={320} w={24} tone="light" />
      </g>
    </svg>
  );
}
