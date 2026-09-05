"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Sender } from "@/lib/types";
import { Button } from "./Button";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function ComposeModal({
  onClose,
  onScheduled,
}: {
  onClose: () => void;
  onScheduled: () => void;
}) {
  const [senders, setSenders] = useState<Sender[]>([]);
  const [senderId, setSenderId] = useState("");
  const [newSenderLabel, setNewSenderLabel] = useState("");
  const [creatingSender, setCreatingSender] = useState(false);

  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  const [fileName, setFileName] = useState<string | null>(null);
  const [leads, setLeads] = useState<string[]>([]);
  const [parsing, setParsing] = useState(false);
  const [pastedEmails, setPastedEmails] = useState("");

  const [startTime, setStartTime] = useState(() => defaultStartTime());
  const [delayMs, setDelayMs] = useState(2000);
  const [hourlyLimit, setHourlyLimit] = useState(100);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listSenders()
      .then((res) => {
        setSenders(res.senders);
        if (res.senders[0]) setSenderId(res.senders[0].id);
      })
      .catch(() => undefined);
  }, []);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setPastedEmails(""); // file and paste are mutually exclusive sources
    setParsing(true);
    setError(null);
    try {
      const res = await api.parseLeads(file);
      setLeads(res.emails);
    } catch {
      setError("Couldn't read that file. Try a .csv or .txt with one email per line.");
    } finally {
      setParsing(false);
    }
  }

  function handlePasteChange(value: string) {
    setPastedEmails(value);
    setFileName(null); // paste and file are mutually exclusive sources
    const found = new Set<string>();
    for (const raw of value.split(/[\n,]/)) {
      const trimmed = raw.trim().toLowerCase();
      if (EMAIL_REGEX.test(trimmed)) found.add(trimmed);
    }
    setLeads(Array.from(found));
  }

  async function handleCreateSender() {
    if (!newSenderLabel.trim()) return;
    setCreatingSender(true);
    try {
      const res = await api.createSender(newSenderLabel.trim());
      setSenders((prev) => [res.sender, ...prev]);
      setSenderId(res.sender.id);
      setNewSenderLabel("");
    } catch {
      setError("Couldn't create that sender.");
    } finally {
      setCreatingSender(false);
    }
  }

  async function handleSchedule() {
    setError(null);
    if (!senderId) return setError("Choose or create a sender first.");
    if (!subject.trim() || !body.trim()) return setError("Subject and body are required.");
    if (leads.length === 0) return setError("Add at least one recipient — upload a file or paste an address.");

    setSubmitting(true);
    try {
      await api.scheduleCampaign({
        senderId,
        subject,
        body,
        leads,
        startTime: new Date(startTime).toISOString(),
        delayBetweenEmailsMs: delayMs,
        hourlyLimit,
      });
      onScheduled();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't schedule this campaign.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
      <div className="bg-ink-900 border border-ink-700 rounded-lg w-full max-w-xl max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-ink-700 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Compose new email</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-paper" aria-label="Close">
            ✕
          </button>
        </div>

        <div className="p-6 space-y-5">
          <Field label="Send from">
            <div className="flex gap-2">
              <select
                value={senderId}
                onChange={(e) => setSenderId(e.target.value)}
                className="flex-1 bg-ink-800 border border-ink-600 rounded-md px-3 py-2 text-sm"
              >
                {senders.length === 0 && <option value="">No senders yet</option>}
                {senders.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label} ({s.etherealEmail})
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-2 mt-2">
              <input
                value={newSenderLabel}
                onChange={(e) => setNewSenderLabel(e.target.value)}
                placeholder="New sender name, e.g. Outbound A"
                className="flex-1 bg-ink-800 border border-ink-600 rounded-md px-3 py-2 text-sm"
              />
              <Button variant="secondary" onClick={handleCreateSender} disabled={creatingSender}>
                {creatingSender ? "Creating…" : "Add sender"}
              </Button>
            </div>
          </Field>

          <Field label="Subject">
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full bg-ink-800 border border-ink-600 rounded-md px-3 py-2 text-sm"
              placeholder="Quick question about {{company}}"
            />
          </Field>

          <Field label="Body">
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={5}
              className="w-full bg-ink-800 border border-ink-600 rounded-md px-3 py-2 text-sm resize-none"
              placeholder="Write your email…"
            />
          </Field>

          <Field label="Leads">
            <label className="flex items-center justify-center border border-dashed border-ink-600 rounded-md py-4 cursor-pointer hover:border-amber-400 transition-colors">
              <input type="file" accept=".csv,.txt" className="hidden" onChange={handleFile} />
              <span className="text-sm text-slate-300">
                {fileName ?? "Upload a CSV or text file of email leads"}
              </span>
            </label>
            {parsing && <p className="text-xs text-slate-400 mt-2">Reading file…</p>}

            <div className="flex items-center gap-3 my-3">
              <div className="flex-1 h-px bg-ink-700" />
              <span className="text-xs text-slate-400">or paste addresses</span>
              <div className="flex-1 h-px bg-ink-700" />
            </div>

            <textarea
              value={pastedEmails}
              onChange={(e) => handlePasteChange(e.target.value)}
              rows={3}
              placeholder="one@company.com, two@company.com&#10;or one per line"
              className="w-full bg-ink-800 border border-ink-600 rounded-md px-3 py-2 text-sm resize-none"
            />

            {!parsing && leads.length > 0 && (
              <p className="text-xs text-teal-400 mt-2">
                {leads.length} email address{leads.length === 1 ? "" : "es"} detected
              </p>
            )}
          </Field>

          <div className="grid grid-cols-3 gap-3">
            <Field label="Start time">
              <input
                type="datetime-local"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full bg-ink-800 border border-ink-600 rounded-md px-2 py-2 text-sm"
              />
            </Field>
            <Field label="Delay between emails (ms)">
              <input
                type="number"
                min={0}
                value={delayMs}
                onChange={(e) => setDelayMs(Number(e.target.value))}
                className="w-full bg-ink-800 border border-ink-600 rounded-md px-2 py-2 text-sm"
              />
            </Field>
            <Field label="Hourly limit">
              <input
                type="number"
                min={1}
                value={hourlyLimit}
                onChange={(e) => setHourlyLimit(Number(e.target.value))}
                className="w-full bg-ink-800 border border-ink-600 rounded-md px-2 py-2 text-sm"
              />
            </Field>
          </div>

          {error && <p className="text-sm text-rose-400">{error}</p>}
        </div>

        <div className="px-6 py-4 border-t border-ink-700 flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSchedule} disabled={submitting}>
            {submitting ? "Scheduling…" : "Schedule"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm text-slate-300 mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function defaultStartTime(): string {
  const d = new Date(Date.now() + 5 * 60 * 1000); // default: 5 minutes from now
  d.setSeconds(0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}