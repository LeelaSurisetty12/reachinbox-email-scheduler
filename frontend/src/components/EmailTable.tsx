import {
  CalendarClock,
  CheckCircle2,
  Clock3,
  Mail,
  XCircle,
} from "lucide-react";

import type { Email } from "../types/email";

interface EmailTableProps {
  emails: Email[];
  type: "scheduled" | "sent";
}

function formatDate(
  value: string | null | undefined
) {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleString(
    undefined,
    {
      dateStyle: "medium",
      timeStyle: "short",
    }
  );
}

function StatusBadge({
  status,
}: {
  status: Email["status"];
}) {
  if (
    status === "SENT"
  ) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-400">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Sent
      </span>
    );
  }

  if (
    status === "FAILED"
  ) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/10 px-2.5 py-1 text-xs font-semibold text-red-400">
        <XCircle className="h-3.5 w-3.5" />
        Failed
      </span>
    );
  }

  if (
    status === "PROCESSING"
  ) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/10 px-2.5 py-1 text-xs font-semibold text-blue-400">
        <Clock3 className="h-3.5 w-3.5" />
        Processing
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-400">
      <CalendarClock className="h-3.5 w-3.5" />
      Scheduled
    </span>
  );
}

export default function EmailTable({
  emails,
  type,
}: EmailTableProps) {
  if (
    emails.length === 0
  ) {
    return (
      <div className="flex min-h-[280px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-800 bg-slate-900/60 px-6 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-800">
          <Mail className="h-5 w-5 text-slate-500" />
        </div>

        <h4 className="mt-4 text-sm font-semibold text-slate-200">
          {type === "scheduled"
            ? "No scheduled emails"
            : "No sent emails"}
        </h4>

        <p className="mt-1 max-w-sm text-sm text-slate-500">
          {type === "scheduled"
            ? "Emails you schedule will appear here."
            : "Emails that have been processed will appear here."}
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
      <div className="overflow-x-auto">
        <table className="min-w-full">
          <thead className="border-b border-slate-800 bg-slate-950/60">
            <tr>
              <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                Email
              </th>

              <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                Subject
              </th>

              <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                {type === "scheduled"
                  ? "Scheduled time"
                  : "Sent time"}
              </th>

              <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                Status
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-800">
            {emails.map(
              (email) => (
                <tr
                  key={email.id}
                  className="transition hover:bg-slate-800/30"
                >
                  <td className="px-6 py-4">
                    <div className="max-w-[280px] truncate text-sm font-medium text-slate-200">
                      {email.recipient}
                    </div>
                  </td>

                  <td className="px-6 py-4">
                    <div className="max-w-[280px] truncate text-sm text-slate-300">
                      {email.subject}
                    </div>
                  </td>

                  <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-400">
                    {formatDate(
                      type ===
                        "scheduled"
                        ? email.scheduledAt
                        : email.sentAt
                    )}
                  </td>

                  <td className="px-6 py-4">
                    <StatusBadge
                      status={
                        email.status
                      }
                    />
                  </td>
                </tr>
              )
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}