"use client";

export type MobileView = "globe" | "watchlist" | "news";

interface Props {
  value: MobileView;
  onChange: (next: MobileView) => void;
  highSeverityCount?: number;
  watchlistCount?: number;
}

interface TabDef {
  key: MobileView;
  label: string;
  icon: React.ReactNode;
}

const ICON_GLOBE = (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18" />
    <path d="M12 3a14 14 0 0 1 0 18" />
    <path d="M12 3a14 14 0 0 0 0 18" />
  </svg>
);

const ICON_LIST = (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M3 6h18" />
    <path d="M3 12h18" />
    <path d="M3 18h18" />
  </svg>
);

const ICON_NEWS = (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M4 4h13a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
    <path d="M19 6h2a1 1 0 0 1 1 1v9a2 2 0 0 1-2 2h-1" />
    <path d="M8 8h7" />
    <path d="M8 12h7" />
    <path d="M8 16h4" />
  </svg>
);

const TABS: TabDef[] = [
  { key: "globe", label: "Globe", icon: ICON_GLOBE },
  { key: "watchlist", label: "Watchlist", icon: ICON_LIST },
  { key: "news", label: "News", icon: ICON_NEWS },
];

export default function MobileNav({
  value,
  onChange,
  highSeverityCount,
  watchlistCount,
}: Props) {
  return (
    <nav className="mobile-nav" aria-label="Mobile section switcher">
      {TABS.map((t) => {
        const active = t.key === value;
        const badge =
          t.key === "news"
            ? highSeverityCount
            : t.key === "watchlist"
              ? watchlistCount
              : undefined;
        return (
          <button
            key={t.key}
            type="button"
            className={`mobile-nav-tab ${active ? "active" : ""}`}
            onClick={() => onChange(t.key)}
            aria-pressed={active}
          >
            <span className="mobile-nav-icon">{t.icon}</span>
            <span className="mobile-nav-label">{t.label}</span>
            {badge && badge > 0 ? (
              <span
                className={`mobile-nav-badge ${
                  t.key === "news" ? "alert" : ""
                }`}
              >
                {badge}
              </span>
            ) : null}
          </button>
        );
      })}
    </nav>
  );
}
