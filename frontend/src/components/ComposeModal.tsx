import {
  CalendarClock,
  FileText,
  LoaderCircle,
  Upload,
  X,
} from "lucide-react";

import Papa from "papaparse";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";

import type {
  ChangeEvent,
  FormEvent,
} from "react";

import { useState } from "react";
import toast from "react-hot-toast";

import api from "../services/api";

interface Sender {
  id: string;
  email: string;
  name: string;
}

interface ComposeModalProps {
  sender: Sender | null;
  onClose: () => void;
  onScheduled: () => void | Promise<void>;
}

// PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc =
  pdfWorker;

export default function ComposeModal({
  sender,
  onClose,
  onScheduled,
}: ComposeModalProps) {
  // =====================================================
  // Form state
  // =====================================================

  const [subject, setSubject] =
    useState("");

  const [body, setBody] =
    useState("");

  const [recipients, setRecipients] =
    useState<string[]>([]);

  const [fileName, setFileName] =
    useState("");

  const [fileType, setFileType] =
    useState<
      "CSV" | "TXT" | "PDF" | null
    >(null);

  const [parsing, setParsing] =
    useState(false);

  const [loading, setLoading] =
    useState(false);

  // Separate date + time fields
  // so the display is controlled by us.
  const [startDate, setStartDate] =
    useState("");

  const [startTime, setStartTime] =
    useState("");

  const [delaySeconds, setDelaySeconds] =
    useState(2);

  const [hourlyLimit, setHourlyLimit] =
    useState(100);

  // =====================================================
  // Extract email addresses from text
  // =====================================================

  const extractEmails = (
    text: string
  ): string[] => {
    const emailRegex =
      /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

    const matches =
      text.match(emailRegex) || [];

    const uniqueEmails =
      new Set<string>();

    for (const email of matches) {
      uniqueEmails.add(
        email.trim().toLowerCase()
      );
    }

    return Array.from(uniqueEmails);
  };

  // =====================================================
  // Parse CSV
  // =====================================================

  const parseCSV = (
    file: File
  ): Promise<string[]> => {
    return new Promise(
      (resolve, reject) => {
        Papa.parse(file, {
          skipEmptyLines: true,

          complete: (results) => {
            const text =
              results.data
                .map((row) => {
                  if (
                    Array.isArray(row)
                  ) {
                    return row.join(" ");
                  }

                  return String(row);
                })
                .join("\n");

            resolve(
              extractEmails(text)
            );
          },

          error: (error) => {
            reject(error);
          },
        });
      }
    );
  };

  // =====================================================
  // Parse TXT
  // =====================================================

  const parseTXT = async (
    file: File
  ): Promise<string[]> => {
    const text =
      await file.text();

    return extractEmails(text);
  };

  // =====================================================
  // Parse PDF
  // =====================================================

  const parsePDF = async (
    file: File
  ): Promise<string[]> => {
    const arrayBuffer =
      await file.arrayBuffer();

    const pdf =
      await pdfjsLib
        .getDocument({
          data: arrayBuffer,
        })
        .promise;

    let fullText = "";

    for (
      let pageNumber = 1;
      pageNumber <= pdf.numPages;
      pageNumber++
    ) {
      const page =
        await pdf.getPage(
          pageNumber
        );

      const textContent =
        await page.getTextContent();

      const pageText =
        textContent.items
          .map((item) => {
            if (
              "str" in item
            ) {
              return item.str;
            }

            return "";
          })
          .join(" ");

      fullText +=
        `${pageText}\n`;
    }

    return extractEmails(
      fullText
    );
  };

  // =====================================================
  // File upload
  // =====================================================

  const handleFileUpload = async (
    event: ChangeEvent<HTMLInputElement>
  ) => {
    const file =
      event.target.files?.[0];

    if (!file) {
      return;
    }

    const extension =
      file.name
        .split(".")
        .pop()
        ?.toLowerCase();

    setFileName(file.name);
    setRecipients([]);
    setFileType(null);
    setParsing(true);

    try {
      let emails: string[] = [];

      // -----------------------------
      // CSV
      // -----------------------------

      if (
        extension === "csv"
      ) {
        setFileType("CSV");

        emails =
          await parseCSV(file);
      }

      // -----------------------------
      // TXT
      // -----------------------------

      else if (
        extension === "txt"
      ) {
        setFileType("TXT");

        emails =
          await parseTXT(file);
      }

      // -----------------------------
      // PDF
      // -----------------------------

      else if (
        extension === "pdf"
      ) {
        setFileType("PDF");

        emails =
          await parsePDF(file);
      }

      // -----------------------------
      // Unsupported
      // -----------------------------

      else {
        toast.error(
          "Only CSV, TXT, and PDF files are supported."
        );

        setFileName("");
        return;
      }

      setRecipients(
        emails
      );

      if (
        emails.length === 0
      ) {
        toast.error(
          "No email addresses were found in this file."
        );

        return;
      }

      toast.success(
        `${emails.length} email${
          emails.length === 1
            ? ""
            : "s"
        } detected`
      );
    } catch (error) {
      console.error(
        "File parsing error:",
        error
      );

      setRecipients([]);

      toast.error(
        "Could not read this file."
      );
    } finally {
      setParsing(false);

      // Allows selecting the same file again
      event.target.value = "";
    }
  };

  // =====================================================
  // Build start date
  // =====================================================

  const buildStartDate = (): Date | null => {
    if (
      !startDate ||
      !startTime
    ) {
      return null;
    }

    // datetime-local style local date/time
    const combined =
      `${startDate}T${startTime}`;

    const date =
      new Date(combined);

    if (
      Number.isNaN(
        date.getTime()
      )
    ) {
      return null;
    }

    return date;
  };

  // =====================================================
  // Schedule emails
  // =====================================================

  const handleSchedule = async (
    event: FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();

    // -----------------------------
    // Sender validation
    // -----------------------------

    if (!sender) {
      toast.error(
        "No sender is available."
      );

      return;
    }

    // -----------------------------
    // Subject validation
    // -----------------------------

    if (!subject.trim()) {
      toast.error(
        "Please enter a subject."
      );

      return;
    }

    // -----------------------------
    // Body validation
    // -----------------------------

    if (!body.trim()) {
      toast.error(
        "Please enter an email body."
      );

      return;
    }

    // -----------------------------
    // Recipients validation
    // -----------------------------

    if (
      recipients.length === 0
    ) {
      toast.error(
        "Upload a CSV, TXT, or PDF file containing email addresses."
      );

      return;
    }

    // -----------------------------
    // Start date/time
    // -----------------------------

    const scheduledStart =
      buildStartDate();

    if (!scheduledStart) {
      toast.error(
        "Please select a valid start date and time."
      );

      return;
    }

    if (
      scheduledStart.getTime() <=
      Date.now()
    ) {
      toast.error(
        "Start time must be in the future."
      );

      return;
    }

    // -----------------------------
    // Delay validation
    // -----------------------------

    if (
      !Number.isInteger(
        delaySeconds
      ) ||
      delaySeconds < 0
    ) {
      toast.error(
        "Delay must be a non-negative whole number."
      );

      return;
    }

    // -----------------------------
    // Hourly limit validation
    // -----------------------------

    if (
      !Number.isInteger(
        hourlyLimit
      ) ||
      hourlyLimit <= 0
    ) {
      toast.error(
        "Hourly limit must be greater than zero."
      );

      return;
    }

    setLoading(true);

    try {
      const delayMs =
        delaySeconds * 1000;

      // =================================================
      // ONE bulk API request
      // =================================================

      const response =
        await api.post(
          "/api/emails/schedule-bulk",
          {
            senderId:
              sender.id,

            recipients,

            subject:
              subject.trim(),

            body:
              body.trim(),

            startTime:
              scheduledStart.toISOString(),

            delayMs,

            hourlyLimit,
          }
        );

      const count =
        response.data?.count ??
        recipients.length;

      toast.success(
        `${count} email${
          count === 1
            ? ""
            : "s"
        } scheduled successfully.`
      );

      // Refresh dashboard
      await onScheduled();
    } catch (error) {
      console.error(
        "Schedule emails error:",
        error
      );

      let message =
        "Failed to schedule emails.";

      if (
        typeof error ===
          "object" &&
        error !== null &&
        "response" in error
      ) {
        const axiosError =
          error as {
            response?: {
              data?: {
                message?: string;
              };
            };
          };

        message =
          axiosError.response?.data
            ?.message ||
          message;
      }

      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  // =====================================================
  // Render
  // =====================================================

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (
          event.target ===
          event.currentTarget
        ) {
          if (!loading) {
            onClose();
          }
        }
      }}
    >
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-slate-800 bg-slate-900 shadow-2xl">

        {/* ============================================== */}
        {/* Header */}
        {/* ============================================== */}

        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-800 bg-slate-900 px-6 py-5">
          <div>
            <h2 className="text-xl font-bold text-white">
              Compose New Email
            </h2>

            <p className="mt-1 text-sm text-slate-400">
              Create and schedule an email campaign.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* ============================================== */}
        {/* Form */}
        {/* ============================================== */}

        <form
          onSubmit={handleSchedule}
          className="space-y-6 p-6"
        >

          {/* ============================================ */}
          {/* Sender */}
          {/* ============================================ */}

          <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Sender
            </p>

            <p className="mt-1 text-sm font-medium text-slate-200">
              {sender
                ? `${sender.name} (${sender.email})`
                : "No sender available"}
            </p>
          </div>

          {/* ============================================ */}
          {/* Subject */}
          {/* ============================================ */}

          <div>
            <label
              htmlFor="compose-subject"
              className="mb-2 block text-sm font-medium text-slate-300"
            >
              Subject
            </label>

            <input
              id="compose-subject"
              type="text"
              value={subject}
              onChange={(event) =>
                setSubject(
                  event.target.value
                )
              }
              placeholder="Enter email subject"
              disabled={loading}
              className="w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-slate-500 disabled:opacity-50"
            />
          </div>

          {/* ============================================ */}
          {/* Body */}
          {/* ============================================ */}

          <div>
            <label
              htmlFor="compose-body"
              className="mb-2 block text-sm font-medium text-slate-300"
            >
              Body
            </label>

            <textarea
              id="compose-body"
              value={body}
              onChange={(event) =>
                setBody(
                  event.target.value
                )
              }
              placeholder="Write your email..."
              rows={7}
              disabled={loading}
              className="w-full resize-none rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-slate-500 disabled:opacity-50"
            />
          </div>

          {/* ============================================ */}
          {/* Upload */}
          {/* ============================================ */}

          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-sm font-medium text-slate-300">
                Email Leads
              </label>

              <span className="text-xs text-slate-500">
                CSV · TXT · PDF
              </span>
            </div>

            <label
              htmlFor="leads-file"
              className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-slate-700 bg-slate-950/60 px-6 py-8 text-center transition hover:border-slate-500 hover:bg-slate-950"
            >
              <Upload className="h-8 w-8 text-slate-500" />

              <p className="mt-3 text-sm font-semibold text-slate-300">
                Upload lead file
              </p>

              <p className="mt-1 text-xs text-slate-500">
                Select a .csv, .txt, or .pdf file
              </p>

              {parsing && (
                <div className="mt-4 flex items-center gap-2 text-xs text-slate-400">
                  <LoaderCircle className="h-4 w-4 animate-spin" />

                  Reading file...
                </div>
              )}

              {!parsing &&
                fileName && (
                  <div className="mt-4 flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-xs text-slate-300">
                    <FileText className="h-4 w-4" />

                    <span>
                      {fileName}
                    </span>

                    {fileType && (
                      <span className="rounded-md bg-slate-800 px-2 py-0.5 text-[10px] font-bold text-slate-400">
                        {fileType}
                      </span>
                    )}
                  </div>
                )}

              {!parsing &&
                recipients.length >
                  0 && (
                  <div className="mt-4 rounded-full bg-emerald-500/10 px-4 py-1.5 text-xs font-semibold text-emerald-400">
                    {recipients.length} unique email
                    {recipients.length ===
                    1
                      ? ""
                      : "s"} detected
                  </div>
                )}

              <input
                id="leads-file"
                type="file"
                accept=".csv,.txt,.pdf,text/csv,text/plain,application/pdf"
                onChange={
                  handleFileUpload
                }
                disabled={
                  loading ||
                  parsing
                }
                className="hidden"
              />
            </label>
          </div>

          {/* ============================================ */}
          {/* Scheduling */}
          {/* ============================================ */}

          <div className="space-y-4">

            <p className="text-sm font-semibold text-slate-300">
              Scheduling
            </p>

            <div className="grid gap-5 sm:grid-cols-2">

              {/* Date */}

              <div>
                <label
                  htmlFor="start-date"
                  className="mb-2 block text-sm font-medium text-slate-300"
                >
                  Start date
                </label>

                <div className="relative">
                  <CalendarClock className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-500" />

                  <input
                    id="start-date"
                    type="date"
                    value={startDate}
                    onChange={(event) =>
                      setStartDate(
                        event.target
                          .value
                      )
                    }
                    disabled={loading}
                    className="w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 pl-10 text-sm text-white outline-none focus:border-slate-500 disabled:opacity-50"
                  />
                </div>

                <p className="mt-1 text-xs text-slate-600">
                  dd-mm-yyyy
                </p>
              </div>

              {/* Time */}

              <div>
                <label
                  htmlFor="start-time"
                  className="mb-2 block text-sm font-medium text-slate-300"
                >
                  Start time
                </label>

                <div className="relative">
                  <CalendarClock className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-500" />

                  <input
                    id="start-time"
                    type="time"
                    value={startTime}
                    onChange={(event) =>
                      setStartTime(
                        event.target
                          .value
                      )
                    }
                    disabled={loading}
                    className="w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 pl-10 text-sm text-white outline-none focus:border-slate-500 disabled:opacity-50"
                  />
                </div>

                <p className="mt-1 text-xs text-slate-600">
                  --:--
                </p>
              </div>
            </div>

            {/* Delay + hourly limit */}

            <div className="grid gap-5 sm:grid-cols-2">

              {/* Delay */}

              <div>
                <label
                  htmlFor="delay-seconds"
                  className="mb-2 block text-sm font-medium text-slate-300"
                >
                  Delay between emails
                </label>

                <div className="flex items-center gap-2">
                  <input
                    id="delay-seconds"
                    type="number"
                    min="0"
                    step="1"
                    value={
                      delaySeconds
                    }
                    onChange={(event) =>
                      setDelaySeconds(
                        Number(
                          event.target
                            .value
                        )
                      )
                    }
                    disabled={loading}
                    className="w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-slate-500 disabled:opacity-50"
                  />

                  <span className="text-sm text-slate-500">
                    sec
                  </span>
                </div>
              </div>

              {/* Hourly limit */}

              <div>
                <label
                  htmlFor="hourly-limit"
                  className="mb-2 block text-sm font-medium text-slate-300"
                >
                  Hourly limit
                </label>

                <div className="flex items-center gap-2">
                  <input
                    id="hourly-limit"
                    type="number"
                    min="1"
                    step="1"
                    value={
                      hourlyLimit
                    }
                    onChange={(event) =>
                      setHourlyLimit(
                        Number(
                          event.target
                            .value
                        )
                      )
                    }
                    disabled={loading}
                    className="w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-slate-500 disabled:opacity-50"
                  />

                  <span className="whitespace-nowrap text-sm text-slate-500">
                    / hour
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* ============================================ */}
          {/* Summary */}
          {/* ============================================ */}

          <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
              <div>
                <span className="text-slate-500">
                  Recipients
                </span>

                <span className="ml-2 font-semibold text-white">
                  {recipients.length}
                </span>
              </div>

              <div>
                <span className="text-slate-500">
                  Delay
                </span>

                <span className="ml-2 font-semibold text-white">
                  {delaySeconds}s
                </span>
              </div>

              <div>
                <span className="text-slate-500">
                  Hourly limit
                </span>

                <span className="ml-2 font-semibold text-white">
                  {hourlyLimit}
                </span>
              </div>
            </div>
          </div>

          {/* ============================================ */}
          {/* Footer */}
          {/* ============================================ */}

          <div className="flex items-center justify-end gap-3 border-t border-slate-800 pt-5">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="rounded-xl border border-slate-700 px-5 py-3 text-sm font-semibold text-slate-300 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={
                loading ||
                parsing ||
                !sender ||
                recipients.length ===
                  0
              }
              className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? (
                <>
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                  Scheduling...
                </>
              ) : (
                <>
                  <CalendarClock className="h-4 w-4" />
                  Schedule{" "}
                  {recipients.length > 0
                    ? `${recipients.length} `
                    : ""}
                  Email
                  {recipients.length ===
                  1
                    ? ""
                    : "s"}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}