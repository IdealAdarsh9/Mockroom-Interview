import type { ReactNode } from "react";

export function PageHead({ title, sub, actions }: { title: string; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <h1 className="t-display">{title}</h1>
        {sub && <p className="muted" style={{ marginTop: 6, maxWidth: 640 }}>{sub}</p>}
      </div>
      {actions && <div className="row">{actions}</div>}
    </div>
  );
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {children && <p className="muted" style={{ maxWidth: 440, margin: "0 auto 16px" }}>{children}</p>}
      {action}
    </div>
  );
}

export const statusBadge = (s: string) => {
  const m: Record<string, [string, string]> = {
    COMPLETED: ["Completed", "badge-ok"], IN_PROGRESS: ["In progress", "badge-demo"], PAUSED: ["Paused", "badge-warn"], CREATED: ["Not started", ""],
    PREPARING: ["Preparing", ""], FAILED: ["Needs attention", "badge-err"], CANCELLED: ["Cancelled", ""],
  };
  const [label, cls] = m[s] ?? [s, ""];
  return <span className={`badge ${cls}`}>{label}</span>;
};

export const TYPE_LABEL: Record<string, string> = { behavioral: "Behavioral", technical: "Technical", system_design: "System design", mixed: "Mixed loop" };
export const fmtScore = (n: number | null | undefined) => (n === null || n === undefined ? "n/a" : n.toFixed(1));

export function ScoreBar({ label, score, note }: { label: string; score: number | null; note?: string }) {
  return (
    <div className="bar-row">
      <span>{label}{note && <span className="muted t-caption"> {note}</span>}</span>
      <div className="bar-track" aria-hidden="true"><div className="bar-fill" style={{ width: `${((score ?? 0) / 5) * 100}%` }} /></div>
      <span className="num" style={{ fontWeight: 600, textAlign: "right" }}>{score === null ? "n/a" : `${score.toFixed(1)}/5`}</span>
    </div>
  );
}
