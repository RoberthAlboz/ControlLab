import { useEffect, useRef, useState } from "react";

/** Tempo de leitura do aviso: mínimo de 2,4 s, mais 45 ms por caractere. */
export function toastDurationMs(message: string) {
  return Math.max(2400, message.length * 45);
}

/** Aviso temporário. Um aviso novo reinicia o prazo: o timer do anterior não o apaga antes da hora. */
export function useToast() {
  const [toast, setToast] = useState("");
  const timerRef = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timerRef.current), []);
  const notify = (message: string) => {
    window.clearTimeout(timerRef.current);
    setToast(message);
    timerRef.current = window.setTimeout(
      () => setToast(""),
      toastDurationMs(message)
    );
  };
  return { toast, notify };
}
