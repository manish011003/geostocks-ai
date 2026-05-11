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
import { useWatchlists, type WatchlistEntry } from "@/lib/watchlists";
import type { GeoEvent, StockData } from "@/types";

interface Props {
  stocks: StockData[];
  events: GeoEvent[];
  loading?: boolean;
  selected?: string | null;
  onSelect?: (sym: string) => void;
}

function fmtPrice(p: number) {
  if (p > 1000) return p.toLocaleString(undefined, { maximumFractionDigits: 1 });
  return p.toFixed(2);
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
    zIndex: isDragging ? 5 : "auto" as const,
  };

  const positive = data ? data.changePercent >= 0 : true;
  const price = data ? `$${fmtPrice(data.price)}` : "—";
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

export default function Watchlist({
  stocks,
  events,
  loading,
  selected,
  onSelect,
}: Props) {
  const { lists, active, setActive, createList, addStock, removeStock, reorder } =
    useWatchlists();
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
    addStock(list.name, {
      sym: r.sym,
      name: r.name,
      exchange: r.exchange,
      country: r.country,
      sector: r.sector,
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

  const items = list?.entries.map((e) => e.sym) ?? [];

  return (
    <aside className="panel left">
      <div className="panel-header">
        <span>Watchlist</span>
        <span className="count">{list?.entries.length ?? 0}</span>
      </div>

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

      <StockSearch onAdd={handleAdd} existing={existingSet} />

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
        ) : list && list.entries.length > 0 ? (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={items}
              strategy={verticalListSortingStrategy}
            >
              {list.entries.map((entry) => (
                <StockRowSortable
                  key={entry.sym}
                  entry={entry}
                  data={dataBySym.get(entry.sym.toUpperCase())}
                  selected={selected === entry.sym}
                  onSelect={(s) => onSelect?.(s)}
                  onRemove={(s) => removeStock(list.name, s)}
                />
              ))}
            </SortableContext>
          </DndContext>
        ) : (
          <div className="empty-state">No stocks. Search above to add one.</div>
        )}

        <div className="section-title">Regional Risk</div>
        <RiskBars events={events} />
      </div>
    </aside>
  );
}
