"use client";

import { useEffect, useRef, useState } from "react";

interface Cooldown {
  model: string;
  reason: string;
  retryAtIso: string;
}

interface Status {
  ok: boolean;
  reason: string;
  primary: string | null;
  available: string[];
  cooldowns: Cooldown[];
}

function formatRetry(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return "now";
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h`;
  return `${Math.round(hr / 24)}d`;
}

export default function LlmStatusPill() {
  const [status, setStatus] = useState<Status | null>(null);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      try {
        const r = await fetch("/api/llm-status", { cache: "no-store" });
        if (!r.ok) throw new Error(String(r.status));
        const j = (await r.json()) as Status;
        if (alive) setStatus(j);
      } catch {
        if (alive) setStatus(null);
      } finally {
        // Probe more frequently when degraded so the UI recovers quickly.
        const next = status && !status.ok ? 30000 : 60000;
        timer = setTimeout(tick, next);
      }
    };
    tick();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
    // status intentionally omitted from deps — we drive cadence via setTimeout
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  if (!status) return null;

  const ok = status.ok;
  const label = ok
    ? "AI ONLINE"
    : status.reason === "no_key"
      ? "AI OFFLINE"
      : "AI THROTTLED";

  return (
    <div className="llm-pill-wrap" ref={ref}>
      <button
        type="button"
        className={`llm-pill ${ok ? "ok" : "warn"}`}
        onClick={() => setOpen((v) => !v)}
        title={
          ok
            ? `Active model: ${status.primary ?? "n/a"}`
            : "Gemini fallback active — click for details"
        }
        aria-label={label}
      >
        <span className={`pill-dot ${ok ? "ok" : "warn"}`} />
        <span className="pill-label">{label}</span>
      </button>
      {open && (
        <div className="llm-popover">
          <div className="llm-popover-row">
            <span>Status</span>
            <strong className={ok ? "ok" : "warn"}>
              {ok ? "Live" : status.reason.replace("_", " ")}
            </strong>
          </div>
          <div className="llm-popover-row">
            <span>Primary model</span>
            <strong>{status.primary ?? "—"}</strong>
          </div>
          <div className="llm-popover-row">
            <span>Available</span>
            <strong>
              {status.available.length}/{status.available.length + status.cooldowns.length}
            </strong>
          </div>
          {status.cooldowns.length > 0 && (
            <div className="llm-popover-cooldowns">
              <div className="llm-popover-title">On cooldown</div>
              {status.cooldowns.map((c) => (
                <div key={c.model} className="llm-popover-cd">
                  <span className="cd-model">{c.model}</span>
                  <span className={`cd-reason cd-${c.reason}`}>{c.reason}</span>
                  <span className="cd-retry">retry in {formatRetry(c.retryAtIso)}</span>
                </div>
              ))}
            </div>
          )}
          <div className="llm-popover-foot">
            {ok
              ? "All Gemini fallbacks ready. Chat will use the highest-quality available model."
              : status.reason === "no_key"
                ? "No GEMINI_API_KEY configured. The dashboard runs in offline analyst mode using built-in heuristics."
                : "Gemini quota or burst limit hit. The chat will use the offline analyst until a model resets — predictions and event detail still work via heuristics."}
          </div>
        </div>
      )}
    </div>
  );
}
