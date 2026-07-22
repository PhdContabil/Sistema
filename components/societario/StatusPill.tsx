import { statusClass } from "@/lib/societario/options";

export function StatusPill({ status }: { status: string | null | undefined }) {
  if (!status) return <span className="status-pill status-default">—</span>;
  return <span className={`status-pill ${statusClass(status)}`}>{status}</span>;
}
