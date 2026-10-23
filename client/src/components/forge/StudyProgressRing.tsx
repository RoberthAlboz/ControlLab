import { useEffect, useRef, useState } from "react";

type StudyProgressRingProps = {
  value: number;
  ready: boolean;
  label: string;
};

const RADIUS = 16;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export default function StudyProgressRing({ value, ready, label }: StudyProgressRingProps) {
  const percent = Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : 0;
  const [hasUpdated, setHasUpdated] = useState(false);
  const hasInitialData = useRef(false);
  const previousPercent = useRef(percent);

  useEffect(() => {
    if (!ready) {
      hasInitialData.current = false;
      previousPercent.current = percent;
      setHasUpdated(false);
      return;
    }

    if (!hasInitialData.current) {
      hasInitialData.current = true;
      previousPercent.current = percent;
      return;
    }

    if (previousPercent.current !== percent) setHasUpdated(true);
    previousPercent.current = percent;
  }, [percent, ready]);

  return (
    <div
      className={`forge-progress-ring${hasUpdated ? " is-animated" : ""}`}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      aria-valuetext={`${percent}% concluído`}
    >
      <svg viewBox="0 0 40 40" aria-hidden="true" focusable="false">
        <circle className="forge-progress-ring-track" cx="20" cy="20" r={RADIUS} />
        <circle
          className="forge-progress-ring-value"
          cx="20"
          cy="20"
          r={RADIUS}
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - percent / 100)}
          transform="rotate(-90 20 20)"
        />
      </svg>
    </div>
  );
}
