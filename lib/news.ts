export interface RawHeadline {
  title: string;
  description: string;
  publishedAt: string;
  source: string;
  url: string;
}

interface GNewsResp {
  totalArticles?: number;
  articles?: Array<{
    title: string;
    description: string | null;
    publishedAt: string;
    source: { name: string };
    url: string;
  }>;
  errors?: string[];
}

interface NewsAPIResp {
  status: string;
  articles?: Array<{
    title: string;
    description: string | null;
    publishedAt: string;
    source: { name: string };
    url: string;
  }>;
  message?: string;
}

/**
 * Five focused queries fanned out in parallel so we always get a globally
 * representative news mix rather than a single region dominating the results.
 */
const REGIONAL_QUERIES = [
  "geopolitics war sanctions conflict Middle East Asia",
  "US policy Federal Reserve trade tariffs election Americas",
  "Latin America Brazil Mexico Argentina Venezuela election economy",
  "Europe NATO Ukraine Russia energy",
  "Africa India China military trade",
];

const SINGLE_QUERY =
  "geopolitics OR sanctions OR war OR conflict OR trade OR tariffs";

export async function fetchGNews(
  query: string = SINGLE_QUERY,
  max = 10
): Promise<RawHeadline[]> {
  const key = process.env.GNEWS_API_KEY;
  if (!key) throw new Error("GNEWS_API_KEY not configured");

  const url = `https://gnews.io/api/v4/search?q=${encodeURIComponent(
    query
  )}&lang=en&max=${max}&token=${key}`;

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`GNews HTTP ${res.status}`);

  const data = (await res.json()) as GNewsResp;
  if (!data.articles) throw new Error("GNews returned no articles");

  return data.articles.map((a) => ({
    title: a.title,
    description: a.description ?? "",
    publishedAt: a.publishedAt,
    source: a.source?.name ?? "GNews",
    url: a.url,
  }));
}

export async function fetchNewsAPI(
  query: string = SINGLE_QUERY,
  max = 10
): Promise<RawHeadline[]> {
  const key = process.env.NEWS_API_KEY;
  if (!key) throw new Error("NEWS_API_KEY not configured");

  const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(
    query
  )}&sortBy=publishedAt&language=en&pageSize=${max}&apiKey=${key}`;

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`NewsAPI HTTP ${res.status}`);

  const data = (await res.json()) as NewsAPIResp;
  if (!data.articles) throw new Error(`NewsAPI: ${data.message ?? "no articles"}`);

  return data.articles.map((a) => ({
    title: a.title,
    description: a.description ?? "",
    publishedAt: a.publishedAt,
    source: a.source?.name ?? "NewsAPI",
    url: a.url,
  }));
}

/** Normalise titles before deduping: strip whitespace, drop trailing
 *  source-name boilerplate, lowercase. */
function normaliseTitle(t: string): string {
  return t
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[\u2018\u2019\u201C\u201D]/g, "")
    .replace(/\s*[-|–]\s*[^|–-]+$/, "")
    .trim();
}

export function deduplicateByTitle(items: RawHeadline[]): RawHeadline[] {
  const seen = new Set<string>();
  const out: RawHeadline[] = [];
  for (const it of items) {
    const k = normaliseTitle(it.title);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(it);
  }
  return out;
}

/**
 * Fan out 5 regional GNews queries in parallel, dedupe by normalised title,
 * sort by recency, and return the top N. Falls back to a single broad query if
 * GNews is unavailable, then to NewsAPI, then to the curated offline set.
 */
export async function fetchHeadlines(max = 10): Promise<RawHeadline[]> {
  if (process.env.GNEWS_API_KEY) {
    try {
      const perQuery = Math.max(4, Math.ceil(max / REGIONAL_QUERIES.length) + 2);
      const settled = await Promise.allSettled(
        REGIONAL_QUERIES.map((q) => fetchGNews(q, perQuery))
      );
      const all = settled
        .filter(
          (s): s is PromiseFulfilledResult<RawHeadline[]> =>
            s.status === "fulfilled"
        )
        .flatMap((s) => s.value);

      if (all.length > 0) {
        const deduped = deduplicateByTitle(all).sort(
          (a, b) =>
            new Date(b.publishedAt).getTime() -
            new Date(a.publishedAt).getTime()
        );
        return deduped.slice(0, max);
      }

      // Last-ditch single broad query before falling through.
      return deduplicateByTitle(await fetchGNews(SINGLE_QUERY, max));
    } catch (err) {
      console.warn("[news] GNews fan-out failed, trying NewsAPI:", err);
    }
  }
  if (process.env.NEWS_API_KEY) {
    return deduplicateByTitle(await fetchNewsAPI(SINGLE_QUERY, max));
  }
  throw new Error(
    "No news provider configured: set GNEWS_API_KEY or NEWS_API_KEY"
  );
}

/** Hand-curated, slightly stale fallback set so the dashboard always renders. */
export function fallbackHeadlines(): RawHeadline[] {
  const now = Date.now();
  const ago = (h: number) => new Date(now - h * 3600_000).toISOString();
  return [
    {
      title: "Tensions escalate in Eastern Europe as new sanctions package floats",
      description:
        "EU member states debate fresh sanctions targeting energy exports, with markets watching crude futures.",
      publishedAt: ago(1),
      source: "Wire (fallback)",
      url: "#",
    },
    {
      title: "Strait shipping disruption sends oil benchmarks higher",
      description:
        "Drone activity near a key shipping lane has rerouted tankers and lifted Brent and WTI by mid-single digits.",
      publishedAt: ago(2),
      source: "Wire (fallback)",
      url: "#",
    },
    {
      title: "US announces fresh export controls on advanced chips to East Asia",
      description:
        "New rules tighten licensing for AI accelerators; major foundries and equipment makers in focus.",
      publishedAt: ago(3),
      source: "Wire (fallback)",
      url: "#",
    },
    {
      title: "Defence budgets across NATO climb as procurement pipeline expands",
      description:
        "Multi-year contracts target air defense, munitions, and unmanned systems across allied members.",
      publishedAt: ago(4),
      source: "Wire (fallback)",
      url: "#",
    },
    {
      title: "South Asia border friction renews; trade corridor under review",
      description:
        "Diplomatic channels reopen amid a renewed flare-up; commodity flows along the corridor are throttled.",
      publishedAt: ago(5),
      source: "Wire (fallback)",
      url: "#",
    },
    {
      title: "African nations form new minerals alliance to negotiate pricing",
      description:
        "A bloc of producers seeks coordinated terms on cobalt, copper, and lithium offtake agreements.",
      publishedAt: ago(7),
      source: "Wire (fallback)",
      url: "#",
    },
    {
      title: "Latin America election cycle weighs on regional currencies",
      description:
        "Investors trim exposure as multiple votes loom; energy and mining policy continuity in question.",
      publishedAt: ago(9),
      source: "Wire (fallback)",
      url: "#",
    },
    {
      title: "South China Sea standoff prompts shipping insurers to reprice risk",
      description:
        "War-risk premiums rise on selected routes after a series of close encounters at sea.",
      publishedAt: ago(11),
      source: "Wire (fallback)",
      url: "#",
    },
    {
      title: "Cyber-attack on European utility raises grid resilience concerns",
      description:
        "An incident attributed to state-linked actors briefly disrupted operations at a regional operator.",
      publishedAt: ago(14),
      source: "Wire (fallback)",
      url: "#",
    },
    {
      title: "Central bank coordination eyed as currency volatility climbs",
      description:
        "FX desks report elevated overnight vol as multiple jurisdictions weigh intervention.",
      publishedAt: ago(20),
      source: "Wire (fallback)",
      url: "#",
    },
  ];
}
