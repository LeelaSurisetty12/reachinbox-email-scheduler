import {
  CalendarClock,
  CheckCircle2,
  CheckSquare,
  Clock3,
  Mail,
  Square,
  Trash2,
  XCircle,
} from "lucide-react";

import {
  useEffect,
  useState,
} from "react";

import type { Email } from "../types/email";

interface EmailTableProps {
  emails: Email[];
  type: "scheduled" | "sent";

  onDelete: (
    emailId: string
  ) => void;

  onDeleteMany: (
    emailIds: string[]
  ) => void;
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
  if (status === "SENT") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-400">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Sent
      </span>
    );
  }

  if (status === "FAILED") {
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
  onDelete,
  onDeleteMany,
}: EmailTableProps) {
  const [
    selectedIds,
    setSelectedIds,
  ] = useState<Set<string>>(
    new Set()
  );

  // -----------------------------------------
  // Remove IDs that no longer exist
  // -----------------------------------------

  useEffect(() => {
    setSelectedIds(
      (current) => {
        const existingIds =
          new Set(
            emails.map(
              (email) =>
                email.id
            )
          );

        const next =
          new Set<string>();

        current.forEach(
          (id) => {
            if (
              existingIds.has(
                id
              )
            ) {
              next.add(id);
            }
          }
        );

        return next;
      }
    );
  }, [emails]);

  // -----------------------------------------
  // Selection helpers
  // -----------------------------------------

  const allSelected =
    emails.length > 0 &&
    emails.every(
      (email) =>
        selectedIds.has(
          email.id
        )
    );

  const someSelected =
    selectedIds.size > 0 &&
    !allSelected;

  const selectedCount =
    selectedIds.size;

  const toggleOne = (
    emailId: string
  ) => {
    setSelectedIds(
      (current) => {
        const next =
          new Set(current);

        if (
          next.has(emailId)
        ) {
          next.delete(
            emailId
          );
        } else {
          next.add(emailId);
        }

        return next;
      }
    );
  };

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds(
        new Set()
      );

      return;
    }

    setSelectedIds(
      new Set(
        emails.map(
          (email) =>
            email.id
        )
      )
    );
  };

  const handleDeleteSelected =
    () => {
      if (
        selectedIds.size ===
        0
      ) {
        return;
      }

      const confirmed =
        window.confirm(
          `Delete ${selectedIds.size} selected email${
            selectedIds.size ===
            1
              ? ""
              : "s"
          }?`
        );

      if (!confirmed) {
        return;
      }

      onDeleteMany(
        Array.from(
          selectedIds
        )
      );

      setSelectedIds(
        new Set()
      );
    };

  // -----------------------------------------
  // Empty state
  // -----------------------------------------

  if (emails.length === 0) {
    return (
      <div className="flex min-h-[280px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-800 bg-slate-900/60 px-6 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-800">
          <Mail className="h-5 w-5 text-slate-500" />
        </div>

        <h4 className="mt-4 text-sm font-semibold text-slate-200">
          {type ===
          "scheduled"
            ? "No scheduled emails"
            : "No sent emails"}
        </h4>

        <p className="mt-1 max-w-sm text-sm text-slate-500">
          {type ===
          "scheduled"
            ? "Emails you schedule will appear here."
            : "Emails that have been processed will appear here."}
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">

      {/* ======================================= */}
      {/* Bulk action bar */}
      {/* ======================================= */}

      <div className="flex flex-col justify-between gap-3 border-b border-slate-800 bg-slate-950/60 px-5 py-3 sm:flex-row sm:items-center">

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={toggleAll}
            className="inline-flex items-center gap-2 text-sm font-medium text-slate-300 transition hover:text-white"
          >
            {allSelected ? (
              <CheckSquare className="h-5 w-5" />
            ) : (
              <Square className="h-5 w-5" />
            )}

            {allSelected
              ? "Deselect all"
              : "Select all"}
          </button>

          <span className="text-xs text-slate-600">
            {emails.length} email
            {emails.length ===
            1
              ? ""
              : "s"}
          </span>

          {someSelected && (
            <span className="text-xs text-slate-500">
              {selectedCount} selected
            </span>
          )}
        </div>

        {selectedCount > 0 && (
          <button
            type="button"
            onClick={
              handleDeleteSelected
            }
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs font-semibold text-red-400 transition hover:bg-red-500/10"
          >
            <Trash2 className="h-4 w-4" />

            Delete Selected (
            {selectedCount})
          </button>
        )}
      </div>

      {/* ======================================= */}
      {/* Table */}
      {/* ======================================= */}

      <div className="overflow-x-auto">
        <table className="min-w-full">
          <thead className="border-b border-slate-800 bg-slate-950/40">
            <tr>

              {/* Select all checkbox */}

              <th className="w-12 px-4 py-4">
                <button
                  type="button"
                  onClick={
                    toggleAll
                  }
                  aria-label={
                    allSelected
                      ? "Deselect all emails"
                      : "Select all emails"
                  }
                  className="text-slate-500 transition hover:text-white"
                >
                  {allSelected ? (
                    <CheckSquare className="h-5 w-5" />
                  ) : (
                    <Square className="h-5 w-5" />
                  )}
                </button>
              </th>

              <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                Email
              </th>

              <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                Subject
              </th>

              <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                {type ===
                "scheduled"
                  ? "Scheduled time"
                  : "Sent time"}
              </th>

              <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                Status
              </th>

              <th className="px-6 py-4 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                Action
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-800">
            {emails.map(
              (email) => {
                const isSelected =
                  selectedIds.has(
                    email.id
                  );

                return (
                  <tr
                    key={
                      email.id
                    }
                    className={`transition hover:bg-slate-800/30 ${
                      isSelected
                        ? "bg-slate-800/20"
                        : ""
                    }`}
                  >

                    {/* Checkbox */}

                    <td className="px-4 py-4">
                      <button
                        type="button"
                        onClick={() =>
                          toggleOne(
                            email.id
                          )
                        }
                        aria-label={`Select ${email.recipient}`}
                        className="text-slate-500 transition hover:text-white"
                      >
                        {isSelected ? (
                          <CheckSquare className="h-5 w-5" />
                        ) : (
                          <Square className="h-5 w-5" />
                        )}
                      </button>
                    </td>

                    {/* Recipient */}

                    <td className="px-4 py-4">
                      <div className="max-w-[280px] truncate text-sm font-medium text-slate-200">
                        {email.recipient}
                      </div>
                    </td>

                    {/* Subject */}

                    <td className="px-6 py-4">
                      <div className="max-w-[280px] truncate text-sm text-slate-300">
                        {email.subject}
                      </div>
                    </td>

                    {/* Date */}

                    <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-400">
                      {formatDate(
                        type ===
                        "scheduled"
                          ? email.scheduledAt
                          : email.sentAt
                      )}
                    </td>

                    {/* Status */}

                    <td className="px-6 py-4">
                      <StatusBadge
                        status={
                          email.status
                        }
                      />
                    </td>

                    {/* Individual delete */}

                    <td className="px-6 py-4 text-right">
                      <button
                        type="button"
                        onClick={() =>
                          onDelete(
                            email.id
                          )
                        }
                        className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/20 px-3 py-2 text-xs font-semibold text-red-400 transition hover:bg-red-500/10"
                        title="Delete email"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              }
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}