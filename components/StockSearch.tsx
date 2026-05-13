"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

export interface SearchResult {
  sym: string;
  /** Optional original Yahoo symbol (e.g. "RELIANCE.NS"). The Watchlist
   *  stores the bare ticker + exchange so we don't need this client-side. */
  yahooSym?: string;
  name: string;
  /** Yahoo's `exchDisp` label, e.g. "BSE", "NMS". Kept for display only. */
  exchange: string;
  /** v2: our normalised exchange key (NYSE | NASDAQ | BSE | NSE | ...).
   *  May be null when we can't map confidently. */
  exchangeKey: import("@/lib/exchanges").ExchangeKey | null;
  country: string;
  flag: string;
  type?: string;
  sector?: string;
  currency?: string;
}

interface Props {
  onAdd: (entry: SearchResult) => void;
  /** Symbols already in the active list; rendered as "Added" pills */
  existing: Set<string>;
  /** Restrict search to a single exchange. "ALL" or undefined → no filter. */
  exchangeFilter?: "ALL" | import("@/lib/exchanges").ExchangeKey;
}

const DEBOUNCE_MS = 220;

export default function StockSearch({ onAdd, existing, exchangeFilter }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Debounced fetch
  useEffect(() => {
    const q = query.trim();
    if (q.length < 1) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const id = window.setTimeout(async () => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      try {
        const params = new URLSearchParams({ q });
        if (exchangeFilter && exchangeFilter !== "ALL") {
          params.set("exchange", exchangeFilter);
        }
        const res = await fetch(`/api/search-stock?${params.toString()}`, {
          signal: ctrl.signal,
        });
        const data = (await res.json()) as { results?: SearchResult[] };
        setResults(data.results ?? []);
      } catch (err) {
        if ((err as { name?: string }).name !== "AbortError") {
          console.warn("[search] failed", err);
          setResults([]);
        }
      } finally {
        setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [query, exchangeFilter]);

  // Close on outside click + Escape
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        (document.activeElement as HTMLElement | null)?.blur();
      }
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const grouped = useMemo(() => {
    const order: string[] = [];
    const buckets = new Map<string, SearchResult[]>();
    for (const r of results) {
      const k = r.country || "—";
      if (!buckets.has(k)) {
        buckets.set(k, []);
        order.push(k);
      }
      buckets.get(k)!.push(r);
    }
    return order.map((c) => ({ country: c, items: buckets.get(c)! }));
  }, [results]);

  const handleAdd = useCallback(
    (r: SearchResult) => {
      onAdd(r);
    },
    [onAdd]
  );

  return (
    <div className="search-wrap" ref={wrapRef}>
      <div className="search-bar">
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <input
          type="text"
          placeholder="Search any stock globally…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          spellCheck={false}
          autoComplete="off"
        />
        {query ? (
          <button
            type="button"
            className="search-clear"
            onClick={() => {
              setQuery("");
              setResults([]);
            }}
            aria-label="Clear search"
          >
            ×
          </button>
        ) : null}
      </div>

      {open && (loading || results.length > 0) ? (
        <div className="search-dropdown" role="listbox">
          {loading && results.length === 0 ? (
            <div className="search-empty">Searching…</div>
          ) : null}

          {grouped.map((group) => (
            <div key={group.country} className="search-group">
              <div className="search-group-title">{group.country}</div>
              {group.items.map((r) => {
                const inList = existing.has(r.sym.toUpperCase());
                return (
                  <div className="search-item" key={r.sym} role="option">
                    <span className="search-flag">{r.flag}</span>
                    <span className="search-sym">{r.sym}</span>
                    <span className="search-name" title={r.name}>
                      {r.name}
                    </span>
                    <span className="search-exch">{r.exchange}</span>
                    <button
                      type="button"
                      className={`search-add ${inList ? "added" : ""}`}
                      onClick={() => handleAdd(r)}
                      disabled={inList}
                    >
                      {inList ? "✓" : "+"}
                    </button>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
