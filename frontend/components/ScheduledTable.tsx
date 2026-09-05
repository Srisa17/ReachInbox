"use client";

import { ScheduledEmailItem } from "@/lib/types";
import { StatusBadge } from "./StatusBadge";
import { EmptyState } from "./EmptyState";
import { Spinner } from "./Spinner";
import { Button } from "./Button";

export function ScheduledTable({
  emails,
  loading,
  onCancel,
}: {
  emails: ScheduledEmailItem[];
  loading: boolean;
  onCancel: (id: string) => void;
}) {
  if (loading) return <Spinner label="Loading scheduled emails…" />;

  if (emails.length === 0) {
    return (
      <EmptyState
        title="Nothing scheduled yet"
        hint="Compose a campaign and it will show up here, waiting for its send time."
      />
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="text-slate-400 border-b border-ink-700">
            <th className="py-3 pr-4 font-normal">Email</th>
            <th className="py-3 pr-4 font-normal">Subject</th>
            <th className="py-3 pr-4 font-normal">Scheduled time</th>
            <th className="py-3 pr-4 font-normal">Status</th>
            <th className="py-3 pr-4 font-normal" />
          </tr>
        </thead>
        <tbody>
          {emails.map((email) => (
            <tr key={email.id} className="border-b border-ink-800 hover:bg-ink-800/40">
              <td className="py-3 pr-4">{email.toEmail}</td>
              <td className="py-3 pr-4 text-slate-300">{email.subject}</td>
              <td className="py-3 pr-4 font-mono text-slate-300">
                {new Date(email.scheduledFor).toLocaleString()}
              </td>
              <td className="py-3 pr-4">
                <StatusBadge status={email.status} />
              </td>
              <td className="py-3 pr-4 text-right">
                <Button variant="danger" onClick={() => onCancel(email.id)} className="px-2 py-1">
                  Cancel
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
