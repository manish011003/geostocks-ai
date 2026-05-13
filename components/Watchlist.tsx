"use client";

import { useMemo, useState } from "react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import StockChart from "@/components/StockChart";
import RiskBars from "@/components/RiskBars";
import StockSearch, { type SearchResult } from "@/components/StockSearch";
import ExchangeSelector from "@/components/ExchangeSelector";
import {
  useWatchlists,
  type WatchlistEntry,
  type ExchangeFilter,
} from "@/lib/watchlists";
import {
  EXCHANGES,
  formatPriceCompact,
  getExchangeStatus,
  resolveExchange,
  type ExchangeKey,
} from "@/lib/exchanges";
import type { GeoEvent, StockData } from "@/types";

// arrayMove is exported via @dnd-kit/sortable; this side-effect import
// keeps it tree-shakeable for users that don't drag.
void arrayMove;

interface Props {
  stocks: StockData[];
  events: GeoEvent[];
  loading?: boolean;
  selected?: string | null;
  onSelect?: (sym: string) => void;
  /** Called when the user clicks an exchange pill (so the parent can
   *  animate the globe to that exchange's country). */
  onPickExchange?: (key: ExchangeKey) => void;
}

interface RowProps {
  entry: WatchlistEntry;
  data?: StockData;
  selected: boolean;
  onSelect: (sym: string) => void;
  onRemove: (sym: string) => void;
}

function StockRowSortable({
  entry,
  data,
  selected,
  onSelect,
  onRemove,
}: RowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: entry.sym });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    zIndex: isDragging ? 5 : ("auto" as const),
  };

  const positive = data ? data.changePercent >= 0 : true;
  const exchangeKey: ExchangeKey =
    (data?.exchange as ExchangeKey | undefined) ??
    (entry.exchange as ExchangeKey | undefined) ??
    (resolveExchange(entry.sym) as ExchangeKey);
  const currency = data?.currency ?? entry.currency ?? EXCHANGES[exchangeKey].currency;
  const price = data ? formatPriceCompact(data.price, currency) : "—";
  const pct = data
    ? `${positive ? "+" : ""}${data.changePercent.toFixed(2)}%`
    : "";

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`stock-row ${data ? (positive ? "up" : "down") : ""} ${selected ? "active" : ""}`}
      onClick={() => onSelect(entry.sym)}
      data-sym={entry.sym}
    >
      <button
        type="button"
        className="drag-handle"
        aria-label={`Drag ${entry.sym}`}
        {...attributes}
        {...listeners}
        onClick={(e) => e.stopPropagation()}
      >
        ⠿
      </button>
      <div className="sym">
        <span
          className="row-flag"
          aria-hidden="true"
          title={EXCHANGES[exchangeKey].name}
        >
          {EXCHANGES[exchangeKey].flag}
        </span>
        {entry.sym}
      </div>
      <div className="price">{price}</div>
      <div className="name" title={entry.name}>
        {entry.name ?? entry.sym}
      </div>
      <div className="pct">{pct}</div>
      <button
        type="button"
        className="row-remove"
        aria-label={`Remove ${entry.sym}`}
        onClick={(e) => {
          e.stopPropagation();
          onRemove(entry.sym);
        }}
      >
        ×
      </button>
      <div className="spark">
        <StockChart data={data?.sparkline ?? []} positive={positive} />
      </div>
    </div>
  );
}

interface GroupHeaderProps {
  exchange: ExchangeKey;
  count: number;
}

function GroupHeader({ exchange, count }: GroupHeaderProps) {
  const ex = EXCHANGES[exchange];
  // Cheap: getExchangeStatus is pure, runs locally. Computed at render time
  // — accurate enough for a header that rerenders on every 30 s tick anyway.
  const status = getExchangeStatus(exchange);
  return (
    <div className={`watchlist-group-header status-${status.status.toLowerCase()}`}>
      <span className="group-dot" style={{ background: status.color }} />
      <span className="group-flag" aria-hidden="true">
        {ex.flag}
      </span>
      <span className="group-name">{ex.key}</span>
      <span className="group-meta">{status.label}</span>
      <span className="group-count">{count}</span>
    </div>
  );
}

export default function Watchlist({
  stocks,
  events,
  loading,
  selected,
  onSelect,
  onPickExchange,
}: Props) {
  const {
    lists,
    active,
    exchangeFilter,
    groupByExchange,
    setActive,
    createList,
    addStock,
    removeStock,
    reorder,
    setGroupByExchange,
  } = useWatchlists();
  const list = useMemo(
    () => lists.find((l) => l.name === active) ?? lists[0],
    [lists, active]
  );
  const dataBySym = useMemo(() => {
    const m = new Map<string, StockData>();
    for (const s of stocks) m.set(s.sym.toUpperCase(), s);
    return m;
  }, [stocks]);

  const existingSet = useMemo(
    () => new Set(list?.entries.map((e) => e.sym.toUpperCase()) ?? []),
    [list]
  );

  // Apply the exchange filter
  const filteredEntries = useMemo(() => {
    if (!list) return [] as WatchlistEntry[];
    if (exchangeFilter === "ALL") return list.entries;
    return list.entries.filter(
      (e) =>
        ((e.exchange as ExchangeKey | undefined) ??
          (resolveExchange(e.sym) as ExchangeKey)) === exchangeFilter
    );
  }, [list, exchangeFilter]);

  // Optionally group by exchange. We preserve the user's drag-ordered
  // sequence within each group.
  const grouped = useMemo(() => {
    if (!groupByExchange) return null;
    const buckets = new Map<ExchangeKey, WatchlistEntry[]>();
    const order: ExchangeKey[] = [];
    for (const e of filteredEntries) {
      const ex = ((e.exchange as ExchangeKey | undefined) ??
        (resolveExchange(e.sym) as ExchangeKey)) as ExchangeKey;
      if (!buckets.has(ex)) {
        buckets.set(ex, []);
        order.push(ex);
      }
      buckets.get(ex)!.push(e);
    }
    return order.map((ex) => ({ exchange: ex, entries: buckets.get(ex)! }));
  }, [filteredEntries, groupByExchange]);

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const handleDragEnd = (e: DragEndEvent) => {
    if (!list) return;
    const { active: dragged, over } = e;
    if (!over || dragged.id === over.id) return;
    const fromIndex = list.entries.findIndex((x) => x.sym === dragged.id);
    const toIndex = list.entries.findIndex((x) => x.sym === over.id);
    if (fromIndex >= 0 && toIndex >= 0) reorder(list.name, fromIndex, toIndex);
  };

  const handleAdd = (r: SearchResult) => {
    if (!list) return;
    const exchange =
      (r.exchangeKey as ExchangeKey | null) ??
      (resolveExchange(r.sym) as ExchangeKey);
    const ex = EXCHANGES[exchange];
    addStock(list.name, {
      sym: r.sym,
      name: r.name,
      exchange,
      country: ex.country,
      sector: r.sector,
      currency: ex.currency,
    });
  };

  const handleCreate = () => {
    const name = newName.trim();
    if (!name) {
      setCreating(false);
      return;
    }
    createList(name);
    setNewName("");
    setCreating(false);
  };

  const items = filteredEntries.map((e) => e.sym);

  return (
    <aside className="panel left">
      <div className="panel-header">
        <span>Watchlist</span>
        <div className="panel-header-actions">
          <button
            type="button"
            className={`group-toggle ${groupByExchange ? "on" : ""}`}
            onClick={() => setGroupByExchange(!groupByExchange)}
            aria-pressed={groupByExchange}
            title={
              groupByExchange
                ? "Flat list (drag to reorder)"
                : "Group by exchange"
            }
          >
            ☷
          </button>
          <span className="count">{filteredEntries.length}</span>
        </div>
      </div>

      <ExchangeSelector onPickExchange={onPickExchange} />

      <div className="watchlist-tabs">
        {lists.map((l) => (
          <button
            key={l.name}
            type="button"
            className={`tab ${l.name === active ? "active" : ""}`}
            onClick={() => setActive(l.name)}
            title={l.name}
          >
            {l.name}
          </button>
        ))}
        {creating ? (
          <input
            className="tab-input"
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onBlur={handleCreate}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreate();
              if (e.key === "Escape") {
                setCreating(false);
                setNewName("");
              }
            }}
            placeholder="Name…"
          />
        ) : (
          <button
            type="button"
            className="tab-add"
            onClick={() => setCreating(true)}
            aria-label="Create list"
          >
            +
          </button>
        )}
      </div>

      <StockSearch
        onAdd={handleAdd}
        existing={existingSet}
        exchangeFilter={exchangeFilter as ExchangeFilter}
      />

      <div className="panel-body">
        {loading && stocks.length === 0 ? (
          <div style={{ padding: 8 }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="skel"
                style={{ height: 48, marginBottom: 6 }}
              />
            ))}
          </div>
        ) : list && filteredEntries.length > 0 ? (
          groupByExchange && grouped ? (
            // Grouped: render each exchange section. Drag/drop is disabled
            // inside groups (group order is fixed; row order within a group
            // still reflects the user's flat-list drag ordering).
            <div className="watchlist-grouped">
              {grouped.map((g) => (
                <div key={g.exchange} className="watchlist-group">
                  <GroupHeader
                    exchange={g.exchange}
                    count={g.entries.length}
                  />
                  {g.entries.map((entry) => (
                    <FlatRow
                      key={entry.sym}
                      entry={entry}
                      data={dataBySym.get(entry.sym.toUpperCase())}
                      selected={selected === entry.sym}
                      onSelect={(s) => onSelect?.(s)}
                      onRemove={(s) =>
                        list ? removeStock(list.name, s) : undefined
                      }
                    />
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={items}
                strategy={verticalListSortingStrategy}
              >
                {filteredEntries.map((entry) => (
                  <StockRowSortable
                    key={entry.sym}
                    entry={entry}
                    data={dataBySym.get(entry.sym.toUpperCase())}
                    selected={selected === entry.sym}
                    onSelect={(s) => onSelect?.(s)}
                    onRemove={(s) =>
                      list ? removeStock(list.name, s) : undefined
                    }
                  />
                ))}
              </SortableContext>
            </DndContext>
          )
        ) : (
          <div className="empty-state">
            {exchangeFilter === "ALL"
              ? "No stocks. Search above to add one."
              : `No ${exchangeFilter} stocks in this list.`}
          </div>
        )}

        <div className="section-title">Regional Risk</div>
        <RiskBars events={events} />
      </div>
    </aside>
  );
}

/** Non-sortable variant rendered inside grouped sections. Mirrors
 *  `StockRowSortable` but skips the dnd machinery so we don't pull in
 *  conflicting DragHandle contexts inside groups. */
function FlatRow({ entry, data, selected, onSelect, onRemove }: RowProps) {
  const positive = data ? data.changePercent >= 0 : true;
  const exchangeKey: ExchangeKey =
    (data?.exchange as ExchangeKey | undefined) ??
    (entry.exchange as ExchangeKey | undefined) ??
    (resolveExchange(entry.sym) as ExchangeKey);
  const currency =
    data?.currency ?? entry.currency ?? EXCHANGES[exchangeKey].currency;
  const price = data ? formatPriceCompact(data.price, currency) : "—";
  const pct = data
    ? `${positive ? "+" : ""}${data.changePercent.toFixed(2)}%`
    : "";

  return (
    <div
      className={`stock-row flat ${data ? (positive ? "up" : "down") : ""} ${
        selected ? "active" : ""
      }`}
      onClick={() => onSelect(entry.sym)}
      data-sym={entry.sym}
    >
      <span className="drag-handle disabled" aria-hidden="true">
        ⠿
      </span>
      <div className="sym">{entry.sym}</div>
      <div className="price">{price}</div>
      <div className="name" title={entry.name}>
        {entry.name ?? entry.sym}
      </div>
      <div className="pct">{pct}</div>
      <button
        type="button"
        className="row-remove"
        aria-label={`Remove ${entry.sym}`}
        onClick={(e) => {
          e.stopPropagation();
          onRemove(entry.sym);
        }}
      >
        ×
      </button>
      <div className="spark">
        <StockChart data={data?.sparkline ?? []} positive={positive} />
      </div>
    </div>
  );
}
