import { useEffect, useState } from "react";

/** Countdown shown during a question. Never blocks — just says when time's up. */
export function Timer({ minutes, resetKey }: { minutes: number; resetKey: string }) {
  const [left, setLeft] = useState(minutes * 60);
  useEffect(() => setLeft(minutes * 60), [minutes, resetKey]);
  useEffect(() => {
    if (minutes === 0) return;
    const h = setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(h);
  }, [minutes, resetKey]);
  if (minutes === 0) return null;
  const mm = Math.floor(left / 60);
  const ss = String(left % 60).padStart(2, "0");
  return <span className={`iv-timer ${left === 0 ? "is-up" : ""}`}>{left === 0 ? "Time's up" : `${mm}:${ss}`}</span>;
}
