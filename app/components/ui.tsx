import { useEffect, useRef, useState, type ReactNode } from "react";
import { formatMoney } from "./format";

export function ViewHeader({
  eyebrow,
  title,
  detail,
  action,
}: {
  eyebrow: string;
  title: string;
  detail?: string;
  action?: ReactNode;
}) {
  return (
    <header className="view-header">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        {detail ? <p className="lede">{detail}</p> : null}
      </div>
      {action ? <div className="header-action">{action}</div> : null}
    </header>
  );
}

export function StatusMessage({
  tone = "neutral",
  children,
  id,
}: {
  tone?: "neutral" | "success" | "warning" | "error";
  children: ReactNode;
  id?: string;
}) {
  return (
    <div className={`status-message ${tone}`} id={id} role={tone === "error" ? "alert" : "status"}>
      <span className="status-symbol" aria-hidden="true">
        {tone === "success" ? "✓" : tone === "error" ? "!" : tone === "warning" ? "!" : "i"}
      </span>
      <div>{children}</div>
    </div>
  );
}

export function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span>
        {label} {required ? <b aria-hidden="true">*</b> : null}
      </span>
      {children}
      {hint ? <small>{hint}</small> : null}
    </label>
  );
}

export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span aria-hidden="true">○</span>
      <h2>{title}</h2>
      <p>{children}</p>
      {action}
    </div>
  );
}

export function CountUpMoney({ pence }: { pence: number }) {
  const [display, setDisplay] = useState(0);
  const settled = useRef(false);

  useEffect(() => {
    if (
      settled.current ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      settled.current = true;
      setDisplay(pence);
      return;
    }
    settled.current = true;
    const duration = 900;
    const start = performance.now();
    let frame = 0;
    function step(now: number) {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(pence * eased));
      if (t < 1) frame = requestAnimationFrame(step);
    }
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [pence]);

  return <>{formatMoney(display)}</>;
}

export function LoadingLedger() {
  return (
    <div className="loading-ledger" role="status">
      <span className="sr-only">Loading your expenses</span>
      <div />
      <div />
      <div />
      <div />
    </div>
  );
}
