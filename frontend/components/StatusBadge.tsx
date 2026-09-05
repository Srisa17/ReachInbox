import { EmailStatus } from "@/lib/types";

const STATUS_META: Record<EmailStatus, { color: string; label: string }> = {
  PENDING: { color: "#8B93A7", label: "Pending" },
  QUEUED: { color: "#4FD1C5", label: "Queued" },
  RESCHEDULED: { color: "#F5A623", label: "Rescheduled" },
  SENT: { color: "#F5A623", label: "Sent" },
  FAILED: { color: "#F2607A", label: "Failed" },
};

export function StatusBadge({ status }: { status: EmailStatus }) {
  const meta = STATUS_META[status];
  return (
    <span className="inline-flex items-center gap-2 text-sm text-slate-300">
      <span
        className="inline-block w-2 h-2 rounded-full"
        style={{ backgroundColor: meta.color }}
        aria-hidden
      />
      {meta.label}
    </span>
  );
}
