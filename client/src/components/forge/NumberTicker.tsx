import { useEffect, useRef, useState } from "react";

type NumberTickerProps = {
  value: number;
  ready: boolean;
};

export default function NumberTicker({ value, ready }: NumberTickerProps) {
  const confirmedValue = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  const [displayValue, setDisplayValue] = useState(confirmedValue);
  const displayedValue = useRef(confirmedValue);
  const previousConfirmedValue = useRef<number | null>(ready ? confirmedValue : null);
  const frameId = useRef<number | null>(null);
  const formatter = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });

  useEffect(() => {
    if (frameId.current !== null) cancelAnimationFrame(frameId.current);
    frameId.current = null;

    if (!ready) {
      previousConfirmedValue.current = null;
      displayedValue.current = confirmedValue;
      setDisplayValue(confirmedValue);
      return;
    }

    if (previousConfirmedValue.current === null) {
      previousConfirmedValue.current = confirmedValue;
      displayedValue.current = confirmedValue;
      setDisplayValue(confirmedValue);
      return;
    }

    if (previousConfirmedValue.current === confirmedValue) return;
    previousConfirmedValue.current = confirmedValue;

    const from = displayedValue.current;
    const mediaQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (mediaQuery?.matches) {
      displayedValue.current = confirmedValue;
      setDisplayValue(confirmedValue);
      return;
    }

    const startedAt = performance.now();
    const duration = 480;
    const delta = confirmedValue - from;
    const handleMotionPreferenceChange = (event: MediaQueryListEvent) => {
      if (!event.matches) return;
      if (frameId.current !== null) cancelAnimationFrame(frameId.current);
      frameId.current = null;
      displayedValue.current = confirmedValue;
      setDisplayValue(confirmedValue);
      mediaQuery?.removeEventListener?.("change", handleMotionPreferenceChange);
    };

    const animate = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      const nextValue = Math.round(from + delta * eased);
      displayedValue.current = nextValue;
      setDisplayValue(nextValue);
      if (progress < 1) frameId.current = requestAnimationFrame(animate);
      else {
        frameId.current = null;
        mediaQuery?.removeEventListener?.("change", handleMotionPreferenceChange);
      }
    };

    mediaQuery?.addEventListener?.("change", handleMotionPreferenceChange);
    frameId.current = requestAnimationFrame(animate);

    return () => {
      if (frameId.current !== null) cancelAnimationFrame(frameId.current);
      mediaQuery?.removeEventListener?.("change", handleMotionPreferenceChange);
    };
  }, [confirmedValue, ready]);

  const displayedText = formatter.format(displayValue);
  const confirmedText = formatter.format(confirmedValue);

  return (
    <>
      <span className="study-hours-ticker" aria-hidden="true">
        <span>{displayedText}</span>
        <span className="study-hours-ticker-unit">h</span>
      </span>
      <span className="sr-only">
        {confirmedText} {confirmedValue === 1 ? "hora estudada" : "horas estudadas"}
      </span>
    </>
  );
}
