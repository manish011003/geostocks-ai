"use client";

import { useEffect, useRef, useState } from "react";
import {
  type ChartTimeframe,
  type CurrencyDisplay,
  type DefaultExchangeView,
  type DualBSEPref,
  type GlobeTexture,
  type NewsRefresh,
  type StockRefresh,
  type ThemeMode,
  type TickerSpeed,
  useSettings,
} from "@/lib/settings";
import { useWatchlists } from "@/lib/watchlists";
import { EXCHANGES, EXCHANGE_KEYS, type ExchangeKey } from "@/lib/exchanges";

interface Props {
  open: boolean;
  onClose: () => void;
}

const Section = ({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) => (
  <section className="settings-section">
    <h3>{title}</h3>
    <div className="settings-rows">{children}</div>
  </section>
);

const Row = ({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) => (
  <div className="settings-row">
    <div className="settings-label">
      <div>{label}</div>
      {hint ? <div className="hint">{hint}</div> : null}
    </div>
    <div className="settings-control">{children}</div>
  </div>
);

const Toggle = ({
  on,
  onChange,
}: {
  on: boolean;
  onChange: (next: boolean) => void;
}) => (
  <button
    type="button"
    role="switch"
    aria-checked={on}
    className={`toggle ${on ? "on" : ""}`}
    onClick={() => onChange(!on)}
  >
    <span className="thumb" />
  </button>
);

const Radio = <T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (next: T) => void;
}) => (
  <div className="seg-radio">
    {options.map((o) => (
      <button
        key={String(o.value)}
        type="button"
        className={`seg-opt ${o.value === value ? "active" : ""}`}
        onClick={() => onChange(o.value)}
      >
        {o.label}
      </button>
    ))}
  </div>
);

export default function SettingsDrawer({ open, onClose }: Props) {
  const s = useSettings();
  const { resetDefaults, exportCsv } = useWatchlists();
  const fileRef = useRef<HTMLInputElement>(null);
  const [importMsg, setImportMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const handleExportSettings = () => {
    const blob = new Blob([s.exportJson()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "geostock-settings.json";
    a.click();
    URL.revokeObjectURL(url);
  };
  const handleImportSettings = () => fileRef.current?.click();
  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const text = await f.text();
    s.importJson(text);
    setImportMsg("Settings imported");
    setTimeout(() => setImportMsg(null), 2500);
    e.target.value = "";
  };
  const handleExportWatchlist = () => {
    const blob = new Blob([exportCsv()], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "geostock-watchlists.csv";
    a.click();
    URL.revokeObjectURL(url);
  };
  const handleClearCache = async () => {
    try {
      if ("caches" in window) {
        for (const k of await caches.keys()) await caches.delete(k);
      }
    } catch {
      // ignore
    }
    setImportMsg("Browser cache cleared");
    setTimeout(() => setImportMsg(null), 2500);
  };

  return (
    <>
      <div
        className={`drawer-backdrop ${open ? "open" : ""}`}
        onClick={onClose}
        aria-hidden
      />
      <aside
        className={`settings-drawer ${open ? "open" : ""}`}
        role="dialog"
        aria-label="Settings"
      >
        <div className="settings-header">
          <h2>Settings</h2>
          <button
            type="button"
            className="drawer-close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="settings-body">
          <Section title="Appearance">
            <Row label="Theme">
              <Radio<ThemeMode>
                value={s.theme}
                onChange={(v) => s.set("theme", v)}
                options={[
                  { value: "dark", label: "Dark" },
                  { value: "light", label: "Light" },
                  { value: "auto", label: "Auto" },
                ]}
              />
            </Row>
            <Row label="Globe texture">
              <Radio<GlobeTexture>
                value={s.globeTexture}
                onChange={(v) => s.set("globeTexture", v)}
                options={[
                  { value: "earth-night", label: "Earth Night" },
                  { value: "earth-day", label: "Earth Day" },
                  { value: "minimal", label: "Minimal" },
                ]}
              />
            </Row>
            <Row label="Ticker speed">
              <Radio<TickerSpeed>
                value={s.tickerSpeed}
                onChange={(v) => s.set("tickerSpeed", v)}
                options={[
                  { value: "slow", label: "Slow" },
                  { value: "normal", label: "Normal" },
                  { value: "fast", label: "Fast" },
                ]}
              />
            </Row>
            <Row label="Default chart timeframe">
              <Radio<ChartTimeframe>
                value={s.chartDefaultTimeframe}
                onChange={(v) => s.set("chartDefaultTimeframe", v)}
                options={[
                  { value: "1D", label: "1D" },
                  { value: "1W", label: "1W" },
                  { value: "1M", label: "1M" },
                ]}
              />
            </Row>
          </Section>

          <Section title="Data & Refresh">
            <Row label="Stock refresh interval">
              <Radio<StockRefresh>
                value={s.stockRefreshSec}
                onChange={(v) => s.set("stockRefreshSec", v)}
                options={[
                  { value: 30, label: "30s" },
                  { value: 60, label: "60s" },
                  { value: 300, label: "5m" },
                  { value: 0, label: "Manual" },
                ]}
              />
            </Row>
            <Row label="News refresh interval">
              <Radio<NewsRefresh>
                value={s.newsRefreshSec}
                onChange={(v) => s.set("newsRefreshSec", v)}
                options={[
                  { value: 300, label: "5m" },
                  { value: 600, label: "10m" },
                  { value: 1800, label: "30m" },
                ]}
              />
            </Row>
          </Section>

          <Section title="Exchange Preferences">
            <Row
              label="Default exchange view"
              hint="Which exchange the dashboard starts focused on"
            >
              <select
                className="text-input"
                value={s.defaultExchangeView}
                onChange={(e) =>
                  s.set(
                    "defaultExchangeView",
                    e.target.value as DefaultExchangeView
                  )
                }
              >
                <option value="ALL">🌍 All</option>
                {EXCHANGE_KEYS.map((k) => (
                  <option key={k} value={k}>
                    {EXCHANGES[k].flag} {EXCHANGES[k].name}
                  </option>
                ))}
              </select>
            </Row>
            <Row
              label="Visible exchanges"
              hint="Uncheck to hide from the footer status strip"
            >
              <div className="exchange-checks">
                {EXCHANGE_KEYS.map((k) => {
                  const on = s.visibleExchanges.includes(k);
                  return (
                    <button
                      type="button"
                      key={k}
                      className={`ex-check ${on ? "on" : ""}`}
                      style={
                        on
                          ? { borderColor: EXCHANGES[k].color, color: EXCHANGES[k].color }
                          : undefined
                      }
                      onClick={() => {
                        const next = on
                          ? s.visibleExchanges.filter((x) => x !== k)
                          : ([...s.visibleExchanges, k] as ExchangeKey[]);
                        s.set("visibleExchanges", next);
                      }}
                      title={EXCHANGES[k].name}
                    >
                      <span aria-hidden="true">{EXCHANGES[k].flag}</span>
                      <span>{k}</span>
                    </button>
                  );
                })}
              </div>
            </Row>
            <Row label="Show pre/after-market (US)">
              <Toggle
                on={s.showPrePostMarket}
                onChange={(v) => s.set("showPrePostMarket", v)}
              />
            </Row>
            <Row label="Show IST timing for Indian markets">
              <Toggle
                on={s.showIST}
                onChange={(v) => s.set("showIST", v)}
              />
            </Row>
            <Row label="Currency display">
              <Radio<CurrencyDisplay>
                value={s.currencyDisplay}
                onChange={(v) => s.set("currencyDisplay", v)}
                options={[
                  { value: "Native", label: "Native" },
                  { value: "USD", label: "USD" },
                  { value: "Both", label: "Both" },
                ]}
              />
            </Row>
            <Row
              label="BSE / NSE preference"
              hint="When the same Indian stock is listed on both"
            >
              <Radio<DualBSEPref>
                value={s.dualIndianPref}
                onChange={(v) => s.set("dualIndianPref", v)}
                options={[
                  { value: "BSE", label: "BSE" },
                  { value: "NSE", label: "NSE" },
                  { value: "BOTH", label: "Both" },
                ]}
              />
            </Row>
          </Section>

          <Section title="Globe">
            <Row label="Auto-rotate">
              <Toggle
                on={s.autoRotate}
                onChange={(v) => s.set("autoRotate", v)}
              />
            </Row>
            <Row label={`Rotation speed (${s.rotationSpeed.toFixed(1)})`}>
              <input
                type="range"
                min={0.1}
                max={2}
                step={0.1}
                value={s.rotationSpeed}
                onChange={(e) =>
                  s.set("rotationSpeed", Number(e.target.value))
                }
              />
            </Row>
            <Row label="Show event markers">
              <Toggle
                on={s.showMarkers}
                onChange={(v) => s.set("showMarkers", v)}
              />
            </Row>
            <Row label="Marker pulse animation">
              <Toggle
                on={s.markerPulse}
                onChange={(v) => s.set("markerPulse", v)}
              />
            </Row>
          </Section>

          <Section title="Notifications">
            <Row label="High severity event alerts" hint="Toast pop-ups in top-right">
              <Toggle
                on={s.highSeverityAlerts}
                onChange={(v) => s.set("highSeverityAlerts", v)}
              />
            </Row>
            <Row
              label="Stock price alert threshold"
              hint="Notify when a watchlist stock moves more than this %"
            >
              <input
                type="number"
                min={0.5}
                max={20}
                step={0.5}
                value={s.priceAlertPct}
                onChange={(e) =>
                  s.set("priceAlertPct", Number(e.target.value))
                }
                className="num-input"
              />
            </Row>
            <Row label="Sound alerts">
              <Toggle
                on={s.soundAlerts}
                onChange={(v) => s.set("soundAlerts", v)}
              />
            </Row>
          </Section>

          <Section title="Data Management">
            <Row label="Export watchlists (CSV)">
              <button className="btn" onClick={handleExportWatchlist}>
                Download
              </button>
            </Row>
            <Row label="Reset watchlists">
              <button
                className="btn danger"
                onClick={() => {
                  if (confirm("Reset watchlists to defaults?")) resetDefaults();
                }}
              >
                Reset
              </button>
            </Row>
            <Row label="Reset settings">
              <button
                className="btn danger"
                onClick={() => {
                  if (confirm("Reset all settings to defaults?")) s.reset();
                }}
              >
                Reset
              </button>
            </Row>
            <Row label="Clear browser cache">
              <button className="btn" onClick={handleClearCache}>
                Clear
              </button>
            </Row>
          </Section>

          <Section title="User Profile">
            <Row label="Display name">
              <input
                type="text"
                className="text-input"
                placeholder="Anonymous"
                value={s.displayName}
                onChange={(e) => s.set("displayName", e.target.value)}
              />
            </Row>
            <Row label="Export settings">
              <button className="btn" onClick={handleExportSettings}>
                Download JSON
              </button>
            </Row>
            <Row label="Import settings">
              <button className="btn" onClick={handleImportSettings}>
                Upload JSON
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="application/json"
                style={{ display: "none" }}
                onChange={handleImportFile}
              />
            </Row>
            {importMsg ? <div className="hint ok">{importMsg}</div> : null}
          </Section>
        </div>
      </aside>
    </>
  );
}
