"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { WATCHLIST_SYMS } from "@/lib/watchlist-syms";

type Role = "user" | "assistant";

interface Message {
  id: string;
  role: Role;
  content: string;
  ts: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  selectedTicker?: string | null;
}

const SUGGESTIONS = [
  "Predict LMT over the next 3 months given current geopolitical risks.",
  "Which sectors look most exposed to the headlines on the dashboard?",
  "Compare AAPL vs NVDA — which has stronger 1-year momentum?",
  "Summarize today's geopolitical events in 5 bullets.",
  "What would invalidate a bullish call on XOM right now?",
];

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Tiny markdown→HTML renderer scoped to what Gemini typically emits.
 * Escapes HTML first, so Gemini output is safe to render via dangerouslySetInnerHTML.
 */
function renderMarkdown(src: string): string {
  let s = escapeHtml(src);

  // Fenced code blocks
  s = s.replace(
    /```(\w*)\n?([\s\S]*?)```/g,
    (_m, _lang, code) => `<pre><code>${String(code).trim()}</code></pre>`
  );

  // Inline code
  s = s.replace(/`([^`\n]+)`/g, "<code>$1</code>");

  // Headings (h1-h3)
  s = s.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  s = s.replace(/^## (.+)$/gm, "<h2>$1</h2>");
  s = s.replace(/^# (.+)$/gm, "<h1>$1</h1>");

  // Bold + italic (bold first to avoid greedy *...* eating **...**)
  s = s.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(^|[\s(])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  s = s.replace(/__([^_\n]+)__/g, "<strong>$1</strong>");

  // Bullet lists (- or *)
  s = s.replace(/(?:^|\n)((?:[-*] .+(?:\n|$))+)/g, (match, group: string) => {
    const items = group
      .trim()
      .split("\n")
      .map((l) => l.replace(/^[-*] /, "").trim())
      .filter(Boolean);
    return `\n<ul>${items.map((i) => `<li>${i}</li>`).join("")}</ul>`;
  });

  // Numbered lists
  s = s.replace(/(?:^|\n)((?:\d+\. .+(?:\n|$))+)/g, (match, group: string) => {
    const items = group
      .trim()
      .split("\n")
      .map((l) => l.replace(/^\d+\. /, "").trim())
      .filter(Boolean);
    return `\n<ol>${items.map((i) => `<li>${i}</li>`).join("")}</ol>`;
  });

  // Paragraphs from blank-line separated blocks
  const blocks = s.split(/\n{2,}/).map((blk) => {
    const trimmed = blk.trim();
    if (!trimmed) return "";
    if (/^<(h\d|ul|ol|pre|blockquote)/.test(trimmed)) return trimmed;
    return `<p>${trimmed.replace(/\n/g, "<br/>")}</p>`;
  });
  return blocks.filter(Boolean).join("\n");
}

function detectTicker(s: string): string | null {
  const upper = s.toUpperCase();
  for (const sym of WATCHLIST_SYMS) {
    if (new RegExp(`\\b${sym}\\b`).test(upper)) return sym;
  }
  return null;
}

export default function Chatbot({ open, onClose, selectedTicker }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const activeTicker = useMemo(() => {
    if (selectedTicker) return selectedTicker;
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    return lastUser ? detectTicker(lastUser.content) : null;
  }, [messages, selectedTicker]);

  // Scroll to bottom when messages or stream tokens come in
  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, streaming]);

  // Focus input when the panel opens
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Cancel any in-flight stream on unmount
  useEffect(
    () => () => {
      abortRef.current?.abort();
    },
    []
  );

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || streaming) return;

      const userMsg: Message = {
        id: `u-${Date.now()}`,
        role: "user",
        content: text,
        ts: Date.now(),
      };
      const assistantId = `a-${Date.now()}`;
      const assistantMsg: Message = {
        id: assistantId,
        role: "assistant",
        content: "",
        ts: Date.now(),
      };

      setInput("");
      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setStreaming(true);

      const ctrl = new AbortController();
      abortRef.current = ctrl;

      try {
        const history = [...messages, userMsg].map((m) => ({
          role: m.role,
          content: m.content,
        }));

        const ticker = selectedTicker ?? detectTicker(text);

        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: history, ticker }),
          signal: ctrl.signal,
        });

        if (!res.ok || !res.body) {
          const errText = await res.text().catch(() => "Request failed");
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, content: `_Error: ${errText}_` }
                : m
            )
          );
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let acc = "";

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          acc += chunk;
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, content: acc } : m))
          );
        }
      } catch (err) {
        if ((err as { name?: string }).name === "AbortError") {
          // Cancelled — leave whatever has streamed in place.
        } else {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? {
                    ...m,
                    content: `_Error: ${err instanceof Error ? err.message : "unknown"}_`,
                  }
                : m
            )
          );
        }
      } finally {
        setStreaming(false);
        abortRef.current = null;
      }
    },
    [messages, selectedTicker, streaming]
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (input.trim()) send(input);
      }
    },
    [input, send]
  );

  return (
    <>
      <div
        className={`chat-backdrop ${open ? "open" : ""}`}
        onClick={onClose}
        aria-hidden
      />
      <aside
        className={`chat-dock ${open ? "open" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label="GeoStock AI analyst chatbot"
      >
        <div className="chat-header">
          <div className="chat-title">
            <span className="live-dot" />
            <span>
              GEOSTOCK<span style={{ color: "var(--blue)" }}>·</span>AI ANALYST
            </span>
            {activeTicker ? (
              <span className="chat-ticker-pill">{activeTicker}</span>
            ) : null}
          </div>
          <button
            type="button"
            className="chat-icon-btn"
            aria-label="Close chat"
            onClick={onClose}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>

        <div className="chat-messages" ref={scrollRef}>
          {messages.length === 0 ? (
            <div className="chat-intro">
              <h3 className="font-display">Ask me anything</h3>
              <p>
                I have live access to your watchlist, the AI-tagged
                geopolitical event feed, and 1-year price history for any
                listed ticker. Ask for a multi-month directional view, sector
                exposure, or a what-if on a specific event.
              </p>
              <div className="chat-suggestions">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className="chat-suggestion"
                    onClick={() => send(s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m) => (
              <div key={m.id} className={`chat-msg ${m.role}`}>
                <div className="chat-msg-role">
                  {m.role === "user" ? "YOU" : "ANALYST"}
                </div>
                {m.content ? (
                  <div
                    className="chat-msg-body"
                    dangerouslySetInnerHTML={{
                      __html: renderMarkdown(m.content),
                    }}
                  />
                ) : (
                  <div className="chat-msg-body chat-typing">
                    <span />
                    <span />
                    <span />
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        <form
          className="chat-input"
          onSubmit={(e) => {
            e.preventDefault();
            if (input.trim()) send(input);
          }}
        >
          <textarea
            ref={inputRef}
            value={input}
            placeholder="Predict LMT for the next 3 months given current events…"
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            rows={2}
            disabled={streaming}
          />
          <div className="chat-input-row">
            <span className="chat-hint">Enter to send · Shift+Enter for newline</span>
            {streaming ? (
              <button
                type="button"
                className="chat-send stop"
                onClick={stop}
              >
                STOP
              </button>
            ) : (
              <button
                type="submit"
                className="chat-send"
                disabled={!input.trim()}
              >
                SEND
              </button>
            )}
          </div>
        </form>
      </aside>
    </>
  );
}
