# Graph Report - C:\Users\manisbis\Documents\Projects\geostock  (2026-05-11)

## Corpus Check
- 33 files · ~12,585 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 97 nodes · 123 edges · 26 communities detected
- Extraction: 71% EXTRACTED · 29% INFERRED · 0% AMBIGUOUS · INFERRED: 36 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]

## God Nodes (most connected - your core abstractions)
1. `POST()` - 13 edges
2. `GET()` - 9 edges
3. `buildChatContext()` - 9 edges
4. `ensureEvents()` - 7 edges
5. `getCache()` - 7 edges
6. `setCache()` - 7 edges
7. `getEvents()` - 7 edges
8. `tagHeadlines()` - 7 edges
9. `getStocks()` - 6 edges
10. `analyzeTicker()` - 6 edges

## Surprising Connections (you probably didn't know these)
- `ensureEvents()` --calls--> `getCache()`  [INFERRED]
  C:\Users\manisbis\Documents\Projects\geostock\app\api\analyze\route.ts → C:\Users\manisbis\Documents\Projects\geostock\lib\cache.ts
- `ensureEvents()` --calls--> `tagHeadlines()`  [INFERRED]
  C:\Users\manisbis\Documents\Projects\geostock\app\api\analyze\route.ts → C:\Users\manisbis\Documents\Projects\geostock\lib\gemini.ts
- `ensureEvents()` --calls--> `setCache()`  [INFERRED]
  C:\Users\manisbis\Documents\Projects\geostock\app\api\analyze\route.ts → C:\Users\manisbis\Documents\Projects\geostock\lib\cache.ts
- `POST()` --calls--> `getCache()`  [INFERRED]
  C:\Users\manisbis\Documents\Projects\geostock\app\api\chat\route.ts → C:\Users\manisbis\Documents\Projects\geostock\lib\cache.ts
- `POST()` --calls--> `analyzeTicker()`  [INFERRED]
  C:\Users\manisbis\Documents\Projects\geostock\app\api\chat\route.ts → C:\Users\manisbis\Documents\Projects\geostock\lib\gemini.ts

## Communities

### Community 0 - "Community 0"
Cohesion: 0.2
Nodes (11): getCache(), setCache(), buildChatContext(), detectTickers(), getEvents(), getStocks(), GET(), fallbackStocks() (+3 more)

### Community 1 - "Community 1"
Cohesion: 0.25
Nodes (2): onPointerMove(), updatePointerFromEvent()

### Community 2 - "Community 2"
Cohesion: 0.47
Nodes (8): analyzeTicker(), client(), extractJson(), getGeminiClient(), heuristicPrediction(), isTransientGeminiError(), runWithFallback(), tagHeadlines()

### Community 3 - "Community 3"
Cohesion: 0.43
Nodes (5): fallbackHeadlines(), fetchGNews(), fetchHeadlines(), fetchNewsAPI(), ensureEvents()

### Community 4 - "Community 4"
Cohesion: 0.29
Nodes (5): heuristicTag(), latLonToVec3(), regionToCoords(), updateSun(), solarPosition()

### Community 5 - "Community 5"
Cohesion: 0.53
Nodes (5): renderContext(), busyAnswer(), noKeyAnswer(), POST(), streamText()

### Community 6 - "Community 6"
Cohesion: 0.4
Nodes (2): CenterPanel(), useTheme()

### Community 7 - "Community 7"
Cohesion: 0.67
Nodes (2): escapeHtml(), renderMarkdown()

### Community 8 - "Community 8"
Cohesion: 0.5
Nodes (0): 

### Community 9 - "Community 9"
Cohesion: 1.0
Nodes (2): formatUTC(), TopBar()

### Community 10 - "Community 10"
Cohesion: 1.0
Nodes (0): 

### Community 11 - "Community 11"
Cohesion: 1.0
Nodes (0): 

### Community 12 - "Community 12"
Cohesion: 1.0
Nodes (0): 

### Community 13 - "Community 13"
Cohesion: 1.0
Nodes (0): 

### Community 14 - "Community 14"
Cohesion: 1.0
Nodes (0): 

### Community 15 - "Community 15"
Cohesion: 1.0
Nodes (0): 

### Community 16 - "Community 16"
Cohesion: 1.0
Nodes (0): 

### Community 17 - "Community 17"
Cohesion: 1.0
Nodes (0): 

### Community 18 - "Community 18"
Cohesion: 1.0
Nodes (0): 

### Community 19 - "Community 19"
Cohesion: 1.0
Nodes (0): 

### Community 20 - "Community 20"
Cohesion: 1.0
Nodes (0): 

### Community 21 - "Community 21"
Cohesion: 1.0
Nodes (0): 

### Community 22 - "Community 22"
Cohesion: 1.0
Nodes (0): 

### Community 23 - "Community 23"
Cohesion: 1.0
Nodes (0): 

### Community 24 - "Community 24"
Cohesion: 1.0
Nodes (0): 

### Community 25 - "Community 25"
Cohesion: 1.0
Nodes (0): 

## Knowledge Gaps
- **Thin community `Community 10`** (2 nodes): `layout.tsx`, `RootLayout()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 11`** (2 nodes): `page.tsx`, `onKey()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 12`** (2 nodes): `AskAIButton()`, `AskAIButton.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 13`** (2 nodes): `EventFeed.tsx`, `timeAgo()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 14`** (2 nodes): `RiskBars.tsx`, `colorForScore()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 15`** (2 nodes): `StockChart.tsx`, `StockChart()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 16`** (2 nodes): `TickerTape.tsx`, `fmtPrice()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 17`** (2 nodes): `Tooltip3D.tsx`, `Tooltip3D()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 18`** (2 nodes): `Watchlist.tsx`, `fmtPrice()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 19`** (1 nodes): `eslint.config.mjs`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 20`** (1 nodes): `next-env.d.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 21`** (1 nodes): `next.config.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 22`** (1 nodes): `postcss.config.mjs`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 23`** (1 nodes): `ThemeToggle.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 24`** (1 nodes): `watchlist-syms.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 25`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `heuristicTag()` connect `Community 4` to `Community 2`?**
  _High betweenness centrality (0.132) - this node is a cross-community bridge._
- **Are the 7 inferred relationships involving `POST()` (e.g. with `getCache()` and `analyzeTicker()`) actually correct?**
  _`POST()` has 7 INFERRED edges - model-reasoned connections that need verification._
- **Are the 7 inferred relationships involving `GET()` (e.g. with `getCache()` and `fetchHeadlines()`) actually correct?**
  _`GET()` has 7 INFERRED edges - model-reasoned connections that need verification._
- **Are the 5 inferred relationships involving `buildChatContext()` (e.g. with `POST()` and `getCache()`) actually correct?**
  _`buildChatContext()` has 5 INFERRED edges - model-reasoned connections that need verification._
- **Are the 5 inferred relationships involving `ensureEvents()` (e.g. with `getCache()` and `fetchHeadlines()`) actually correct?**
  _`ensureEvents()` has 5 INFERRED edges - model-reasoned connections that need verification._
- **Are the 6 inferred relationships involving `getCache()` (e.g. with `ensureEvents()` and `POST()`) actually correct?**
  _`getCache()` has 6 INFERRED edges - model-reasoned connections that need verification._