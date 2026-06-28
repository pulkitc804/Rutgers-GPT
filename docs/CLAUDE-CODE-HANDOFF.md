# Rutgers-GPT → Claude Code Handoff

**Last updated:** June 2026  
**Author:** Pulkit Chaudhary (`pc937@scarletmail.rutgers.edu`)  
**Repo:** https://github.com/pulkitc804/Rutgers-GPT  
**Active branch:** `cursor/oracle-response-formatting` (HEAD `05f10a2`)  
**Primary surface:** `apps/web` (Next.js 15) — **web-first**; extension/mobile exist but are not the current focus.

---

## 1. Executive summary

Rutgers-GPT (“Scarlet Oracle”) is a **Rutgers University–New Brunswick student agent** — not a generic chatbot. It combines:

- **Live APIs:** Passio GO buses, Rutgers Dining FoodPro menus, SOC (Schedule of Classes) JSON
- **Tool-calling agent loop:** Ollama (local, default) or Anthropic Claude (optional paid)
- **RAG:** Small hand-curated markdown corpus under `apps/web/data/rutgers-corpus/`
- **Student memory:** Major, courses, home campus, bus stops, remembered facts (localStorage)
- **Anti-hallucination layer:** Verified dining presets, execution contract, truth-layer metadata

**Current maturity:** Functional local demo on `localhost:3000`. Dashboard + chat work when Ollama is running. Schedule quality depends on SOC fetch success and model size (`qwen2.5:7b-instruct` recommended over `llama3.2`). Full campus scrape / “GPT-level” breadth is **not** done — starter corpus + live tools only.

**User’s quality bar (non-negotiable):**
- No invented bus times, menus, section times, or campus locations
- **The Atrium = College Avenue** (College Ave Student Center), not Livingston or Cook/Douglass
- **NB only:** College Ave, Busch, Livingston, Cook/Douglass — no Newark/Camden
- Schedule answers must use **real SOC data**, synthesized intelligently — not template dumps or link spam
- No “dummy bot” behavior (CAPS/TimelyCare filler on schedule questions)

---

## 2. Product vision (original spec)

**Rutgers-GPT** = campus OS / single source of truth for student life.

| Module | Target data | Status |
|--------|-------------|--------|
| Academic Agent | SOC, Degree Navigator, WebReg | **Partial** — SOC + planner + RAG; no DN scrape |
| Logistics Agent | Passio GO, parking | **Partial** — Passio ETAs live |
| Life Agent | Dining, getInvolved events | **Partial** — FoodPro menus; events stub |
| Intel Agent | RateMyProf / SIRS on SOC pages | **Not started** |

**Deferred:** Chrome extension polish, mobile app, full site scrape, professor intel, WebReg auto-fill.

**Strategy decision (May 2026):** Ship and iterate on **website only** until dashboard + Oracle are reliably accurate.

---

## 3. Repository structure

```
Rutgers-GPT/
├── package.json              # root workspaces + turbo
├── turbo.json
├── apps/
│   ├── web/                  # ★ PRIMARY — Next.js 15, Scarlet Oracle
│   ├── extension/            # MV3 side panel (boilerplate + shared dashboard)
│   └── mobile/               # Expo demo (bus + dining smoke test)
├── packages/
│   └── shared/               # @rutgers-gpt/shared — services, AI, store, dashboard
├── docs/
│   ├── CLAUDE-CODE-HANDOFF.md   # this file
│   └── startup-school-ai-agent-session.txt
└── .cursor/rules/            # Cursor-specific rules (scraping, frontend) — optional for Claude Code
```

### Workspaces

| Package | Name | Role |
|---------|------|------|
| `apps/web` | `@rutgers-gpt/web` | Next.js UI, API routes, RAG, agent orchestration |
| `packages/shared` | `@rutgers-gpt/shared` | BusService, DiningService, AcademicService, SchedulePlannerService, agent tools, Zustand store |
| `apps/extension` | (unnamed) | Vite + CRXJS MV3 side panel |
| `apps/mobile` | (unnamed) | Expo + NativeWind minimal demo |

---

## 4. Git state (as of handoff)

```
Branch: cursor/oracle-response-formatting
Remote: origin/cursor/oracle-response-formatting (up to date)
HEAD:   05f10a2 feat(web): Scarlet Oracle agent, SOC planner, RAG, and NB-only scope

Untracked locally:
  docs/                          # handoff + startup school docs
  apps/web/tsconfig.tsbuildinfo  # build artifact — do not commit

main branch is behind feature branch (last main: 0e84ceb Ollama path only)
```

**Do not commit:** `.env.local`, API keys, `node_modules`, `.next`, `dist`.

---

## 5. Local development

### Prerequisites

- Node.js 20+ (npm 10.x)
- **Ollama** for local LLM (recommended)
- Optional: Anthropic API key for cloud Claude

### Install & run

```bash
cd ~/Rutgers-GPT
npm install
npm run dev:web
# → http://localhost:3000 (confirm port in terminal)
```

### Ollama setup (recommended)

```bash
ollama serve                    # if not already running
ollama pull qwen2.5:7b-instruct
# optional for RAG rerank:
ollama pull nomic-embed-text
```

### Other scripts

```bash
npm run clean          # removes apps/web/.next
npm run build:web      # production build
npm run dev            # turbo dev (all workspaces)
```

### Troubleshooting

| Issue | Fix |
|-------|-----|
| Turbopack `[turbopack]_runtime.js` missing | `npm run clean`, use `next dev` (not `dev:turbo`) |
| Wrong port / 404 | Check terminal — may be 3000 vs 3002; kill stale `next dev` |
| Chat 503 / connection refused | Ollama not running or wrong `OLLAMA_BASE_URL` |
| SOC empty / “not in SOC” | Verify `https://classes.rutgers.edu/soc/api/courses.json` reachable from server |
| Weak schedule replies | Use `qwen2.5:7b-instruct`, keep `OLLAMA_DIRECT_SCHEDULE=0` |

---

## 6. Environment variables

**File:** `apps/web/.env.local` (gitignored). Template: `apps/web/.env.example`.

### Recommended local config

```env
ORACLE_LLM=ollama
OLLAMA_MODEL=qwen2.5:7b-instruct
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_TEMPERATURE=0.2
OLLAMA_NUM_CTX=8192
OLLAMA_NUM_PREDICT=2048
OLLAMA_TOP_P=0.9
OLLAMA_REPEAT_PENALTY=1.12
OLLAMA_DIRECT_SCHEDULE=0
# OLLAMA_EMBED_MODEL=nomic-embed-text
```

### Anthropic (optional)

```env
ORACLE_LLM=anthropic
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-sonnet-4-20250514
ANTHROPIC_TEMPERATURE=0.45
```

### LLM resolution logic (`oracle-llm-config.ts`)

1. `ORACLE_LLM=ollama` → always Ollama  
2. `ORACLE_LLM=anthropic` → always Anthropic (requires key)  
3. Unset → Anthropic if `ANTHROPIC_API_KEY` set, else **Ollama**

### Important flags

| Variable | Default | Meaning |
|----------|---------|---------|
| `OLLAMA_DIRECT_SCHEDULE` | `0` | If `1`, schedule questions skip LLM and paste planner markdown (feels robotic — **keep off**) |
| `OLLAMA_MODEL` | `llama3.2` | Override in `.env.local` — `llama3.2` is too weak for tool use |

---

## 7. Architecture overview

```mermaid
flowchart TB
  subgraph client [Browser - apps/web]
    Home[RutgersGptHome]
    Dash[RutgersDashboard]
    Chat[RutgersGptChat]
    Mem[RutgersAgentMemoryPanel]
    Store[(Zustand localStorage)]
    Home --> Dash
    Home --> Chat
    Home --> Mem
    Chat --> Store
    Dash --> Transport[createWebRutgersTransport]
  end

  subgraph api [Next.js API routes]
    Passio[/api/rutgers/passio-eta]
    Dining[/api/rutgers/dining]
    SOC[/api/rutgers/soc]
    ChatRoute[/api/oracle/chat]
    Insights[/api/oracle/insights]
  end

  subgraph agent [Agent layer]
    Intent[detectActionIntent]
    Plan[resolveTermPlan]
    Prefetch[prefetch tools]
    Contract[agent-execution-contract]
    Loop[oracle-agent tool loop]
    RAG[rutgers-rag/search]
  end

  subgraph external [External - server-side fetch]
    PassioGO[rutgers.passiogo.com]
    FoodPro[menuportal23.dining.rutgers.edu]
    SOCAPI[classes.rutgers.edu/soc/api]
    Ollama[Ollama 127.0.0.1:11434]
    Anthropic[Anthropic API]
  end

  Transport --> Passio & Dining & SOC
  Chat --> ChatRoute
  ChatRoute --> Intent --> Plan --> Prefetch --> Contract --> Loop
  Loop --> RAG
  Loop --> Ollama
  Loop --> Anthropic
  Passio --> PassioGO
  Dining --> FoodPro
  SOC --> SOCAPI
```

---

## 8. Scarlet Oracle chat pipeline

**Entry:** `POST /api/oracle/chat` → `apps/web/src/app/api/oracle/chat/route.ts`

### Per-request flow

1. Load `SystemPrompt.txt` via `load-system-prompt.ts`
2. `detectActionIntent(lastUserMessage)` — schedule / dining / transit / wellness
3. **Verified facts** — `detectVerifiedTopics` + `formatVerifiedFactsBlock` (e.g. Atrium campus)
4. **RAG** — keyword search + optional Ollama embedding rerank if campus/policy keywords match
5. **Schedule prefetch** — if schedule intent:
   - `resolveTermPlan` → `SchedulePlannerService` + SOC fetches
   - Inject `PRECOMPUTED_SOC_PLAN` + `SOC_PLAN_REPLY_RULES` into context
   - Push `plan_term_schedule` into `prefetchedTools`
   - Optional **direct render** if `OLLAMA_DIRECT_SCHEDULE=1` (bypass LLM)
6. **Dining/transit prefetch** — server runs tools before LLM when intent matches
7. `buildExecutionContract` — anti-link-dump rules injected every turn
8. `runRutgersOracleAgentStream` — tool loop (max 6 rounds) + final synthesis stream

### Agent loop (`oracle-agent.ts`)

- Tools defined in `packages/shared/src/ai/agent-tools.ts`
- Tool execution: `apps/web/src/lib/rutgers-tool-runner.ts`
- Ollama: `ollama-oracle.ts` — chat + streaming + tool_calls parsing
- Anthropic: native SDK tool use
- Prefetched results injected in user turn (models must not re-fetch)
- Tool JSON truncated at ~7k chars
- Final Ollama pass uses `OLLAMA_FINAL_SYNTHESIS_USER` for polished markdown

### Response format

- `Content-Type: text/plain` streamed body
- Headers: `X-Rutgers-Gpt-Model`, `X-Rutgers-Gpt-Agent: scarlet-oracle-v1`

---

## 9. Agent tools (complete list)

| Tool | Purpose |
|------|---------|
| `get_live_transit` | Passio GO ETAs for profile stops |
| `get_dining_menu` | FoodPro HTML parse → verified campus + menu |
| `get_course_schedule` | Single course SOC lookup |
| `plan_term_schedule` | Multi-course term plan + weekly grid |
| `plan_multi_course_schedule` | Variant for explicit course lists |
| `search_rutgers_knowledge` | RAG over local corpus |
| `get_canvas_guidance` | Canvas/NetID help from corpus |
| `get_campus_events` | EventsService stub |
| `get_campus_info` | NB sub-campus orientation |
| `list_campus_resources` | Official link bundles by category |

---

## 10. Live data sources

### Passio GO (buses)

- **Tenant:** `https://rutgers.passiogo.com`
- **System ID:** `1268`
- **Service:** `packages/shared/src/services/BusService.ts`
- **Proxy:** `apps/web/src/app/api/rutgers/passio-eta/route.ts`
- Default demo stop: `10035`

### Dining (FoodPro)

- **Portal:** `https://menuportal23.dining.rutgers.edu`
- **Service:** `packages/shared/src/services/DiningService.ts`
- **Presets:** `atrium` (College Avenue), `livingston-dining` (Livingston)
- **Proxy:** `apps/web/src/app/api/rutgers/dining/route.ts`
- Parses HTML recipe forms — no official JSON API

### SOC (Schedule of Classes)

- **Primary URL:** `https://classes.rutgers.edu/soc/api/courses.json`
- (Legacy `sis.rutgers.edu` redirects here)
- **Service:** `packages/shared/src/services/AcademicService.ts`
- **Planner:** `packages/shared/src/services/SchedulePlannerService.ts`
- **Proxy:** `apps/web/src/app/api/rutgers/soc/route.ts`
- Campus code for all NB: `NB`
- Term codes: `1` Spring, `7` Summer, `9` Fall

### CS first-year template

- `packages/shared/src/ai/cs-first-year-nb.ts` — used when user asks CS FY track and no explicit course list
- `wantsCsFirstYearTemplate()` in `course-parser.ts`

---

## 11. RAG corpus

**Location:** `apps/web/data/rutgers-corpus/*.md`

| File | Contents |
|------|----------|
| `nb-campuses.md` | NB sub-campuses overview |
| `verified-dining-locations.md` | Atrium = College Ave, etc. |
| `building-hours-nb.md` | Library/building hours (starter) |
| `cs-degree-overview.md` | CS degree pointers |
| `canvas-and-tools.md` | Canvas / NetID |
| `academic-policies.md` | Integrity, add/drop pointers |

**Search:** `apps/web/src/lib/rutgers-rag/search.ts` — keyword tokenization (not vector DB)  
**Rerank:** `embed-ollama.ts` — optional Ollama embeddings  
**Removed:** Newark/Camden corpus files (out of scope)

---

## 12. Student profile & memory

### Zustand store (`rutgers-iq-store.ts`)

Persisted to **localStorage** (web) or chrome.storage (extension).

| Field | Default | Use |
|-------|---------|-----|
| `favoriteStopId` | `10035` | Passio primary stop |
| `secondaryStopIdsRaw` | `""` | Extra stops, comma-separated |
| `diningLocationId` | `atrium` | Dining preset |
| `nbSubcampus` | `College Avenue` | Home campus (NB sub-campus) |
| `major` | `Computer Science` | Profile / planning |
| `enrolledCoursesRaw` | `198:111,640:151,355:101` | SOC planner input |
| `memoryFacts` | `[]` | Cross-session remembered facts |
| `displayName` | `""` | Welcome personalization |

**UI:** `RutgersAgentMemoryPanel`, `RutgersCampusSettings`  
**Profile builder:** `apps/web/src/lib/build-student-profile.ts` → sent with every chat POST

---

## 13. Web UI map

| Component | File | Role |
|-----------|------|------|
| Home shell | `rutgers-gpt-home.tsx` | Layout: sidebar, live panel, chat |
| Chat | `rutgers-gpt-chat.tsx` | Streaming chat, quick actions, copy/reply, remember fact |
| Dashboard | `packages/shared/.../RutgersDashboard.tsx` | Transit, dining, classes, wellness |
| Markdown | `oracle-markdown.tsx` | Renders assistant replies |
| Page | `app/page.tsx` → `page-client.tsx` | Client entry |

**Quick actions in chat:** Next bus, Dining, Next class, Wellness — each sends a constrained prompt.

---

## 14. Extension & mobile status

### Extension (`apps/extension`)

- MV3 side panel, CRXJS + Vite
- Uses shared `RutgersDashboard` + chrome storage adapter
- **No Scarlet Oracle chat wired in extension yet**
- Build: `npm run build --workspace=apps/extension` → load `dist/` unpacked
- Host permissions include Passio, SOC, dining portals

### Mobile (`apps/mobile`)

- Expo smoke test: fetches bus + Atrium menu directly (no Next proxy — may hit CORS in some environments)
- **Not production-ready**

---

## 15. What works vs what doesn’t

### Works (when env + network OK)

- Home page loads with mesh UI
- Live campus panel: refresh bus, dining, SOC demo course
- Chat streams via Ollama with tool calling
- Schedule planning prefetch hits SOC and injects plan into context
- Dining returns live FoodPro items with correct `verified.campus`
- Agent memory persists in localStorage
- GitHub branch with full monorepo

### Fragile / incomplete

| Area | Issue |
|------|-------|
| Schedule quality | Small Ollama models ignore tools or paste raw JSON; SOC timeouts yield empty plans |
| RAG depth | Only 6 markdown files — not “scrape everything” |
| Events | `EventsService` is minimal / placeholder |
| Degree Navigator | No scrape or audit integration |
| Professor intel | Not built |
| Extension Oracle | Not integrated |
| npm audit | 13 vulns in dev deps (Expo, Vite) — not addressed |
| Newark/Camden | Explicitly out of scope but SOC API still supports other campus codes |

### Past bugs fixed (don’t regress)

1. **Atrium campus** — was wrongly Livingston/Cook-Douglass → fixed to College Avenue everywhere
2. **SOC host** — `classes.rutgers.edu` not `sis` direct
3. **OLLAMA_DIRECT_SCHEDULE=1** — made bot feel premade → default `0`
4. **Link dumps** — execution contract + prefetch added
5. **NB scope** — `nbSubcampus` replaces NK/CM in store v3

---

## 16. Key files (quick reference)

```
# Agent & API
apps/web/src/app/api/oracle/chat/route.ts      # main chat endpoint
apps/web/src/app/api/oracle/insights/route.ts  # one-shot campus brief
apps/web/src/lib/oracle-agent.ts               # tool loop + stream
apps/web/src/lib/rutgers-tool-runner.ts        # tool implementations
apps/web/src/lib/resolve-term-plan.ts          # schedule prefetch bridge
apps/web/src/lib/detect-action-intent.ts
apps/web/src/lib/schedule-planning-intent.ts
apps/web/src/lib/agent-execution-contract.ts
apps/web/src/lib/oracle-llm-config.ts
apps/web/src/lib/ollama-oracle.ts
apps/web/src/ai/SystemPrompt.txt               # Scarlet Oracle constitution
apps/web/src/ai/load-system-prompt.ts

# Proxies
apps/web/src/app/api/rutgers/passio-eta/route.ts
apps/web/src/app/api/rutgers/dining/route.ts
apps/web/src/app/api/rutgers/soc/route.ts
apps/web/src/lib/rutgers-web-transport.ts

# RAG
apps/web/src/lib/rutgers-rag/search.ts
apps/web/src/lib/rutgers-rag/load-corpus.ts
apps/web/src/lib/rutgers-rag/embed-ollama.ts

# Shared services
packages/shared/src/services/BusService.ts
packages/shared/src/services/DiningService.ts
packages/shared/src/services/AcademicService.ts
packages/shared/src/services/SchedulePlannerService.ts
packages/shared/src/ai/agent-tools.ts
packages/shared/src/ai/verified-sources.ts
packages/shared/src/ai/nb-scope.ts
packages/shared/src/store/rutgers-iq-store.ts
```

---

## 17. Recommended next priorities

Ordered by user impact:

1. **SOC reliability** — logging, retries, UI badge when planner returns 0 sections; surface fetch errors in chat
2. **Expand RAG** — ingest more official pages (food.rutgers.edu, library hours, bus routes) into corpus or automated pipeline
3. **Model quality** — default docs to `qwen2.5:7b-instruct`; consider optional Anthropic for demos
4. **Schedule UX** — when SOC data exists, optionally render weekly grid in UI (not only in markdown)
5. **More dining presets** — Brower, Busch dining, Neilson, etc. with verified campus mapping
6. **Merge to main** — PR `cursor/oracle-response-formatting` → `main` when stable
7. **Extension** — wire `/api/oracle/chat` through extension or shared backend URL

**Explicitly deferred:** full campus scrape, WebReg automation, RateMyProf injection, mobile ship.

---

## 18. Testing checklist

```bash
# 1. Dev server
npm run dev:web
open http://localhost:3000

# 2. Live campus
# Open "Live campus" → Refresh all
# Expect: bus ETA, dining items, SOC for demo course 198:112

# 3. Chat — transit
# "When is my next bus at stop 10035?"
# Expect: ETAs from tool, not invented times

# 4. Chat — dining
# "What's at the Atrium today?"
# Expect: menu items + College Avenue campus

# 5. Chat — schedule
# "Plan my Fall 2026 schedule for 198:111, 640:151, 355:101"
# Expect: SOC section examples, weekly grid if data exists, no CAPS spam

# 6. Memory
# Set major/courses in Agent Memory → ask schedule → should use profile courses

# 7. Direct API
curl -s http://localhost:3000/api/rutgers/soc?year=2026&term=9&campus=NB&subject=198&courseNumber=111 | head
```

---

## 19. Security & privacy

- **No server-side user DB** — profile in browser localStorage only
- **API keys** only in `apps/web/.env.local` (server-side for Next API routes)
- Ollama calls go to `127.0.0.1` — chat text stays local
- Do not log or commit NetIDs, grades, or Anthropic keys
- Academic integrity rules in system prompt — refuse graded work completion

---

## 20. Claude Code migration notes

### What to read first

1. This document
2. `apps/web/src/ai/SystemPrompt.txt` — product behavior contract
3. `apps/web/src/app/api/oracle/chat/route.ts` — request orchestration
4. `packages/shared/src/services/DiningService.ts` — verified campus pattern

### Conventions in this repo

- TypeScript strict, functional React components (`function` keyword)
- Tailwind + `cn()` for styling; Framer Motion for animations
- Semicolons: match existing file when editing
- Commits: Conventional Commits (`feat(web):`, `fix:`) — **only commit when user asks**
- Scope: minimal diffs; no over-engineering

### User communication style

- High quality bar; rejects “dummy bot” outputs
- Wants **verified primary sources**, not LLM memory for campus facts
- Web-first; don’t expand to extension/mobile without asking
- Rutgers–NB student (`pc937@scarletmail.rutgers.edu`)

### Optional: Claude Code `CLAUDE.md`

Consider adding a root `CLAUDE.md` that points to this handoff + lists:
- `npm run dev:web` as entry command
- `OLLAMA_DIRECT_SCHEDULE=0` always unless debugging
- Atrium = College Avenue rule

### Side context (not code)

- User applied to **Startup School** — session doc in `docs/startup-school-ai-agent-session.txt`
- **Cursor Pro student billing** issue ($20 charges) — separate from this repo

---

## 21. Glossary

| Term | Meaning |
|------|---------|
| **SOC** | Schedule of Classes — official Rutgers section catalog (`sis.rutgers.edu` / `classes.rutgers.edu`) |
| **FoodPro** | Rutgers dining menu HTML portal (`menuportal23.dining.rutgers.edu`) |
| **Passio GO** | Rutgers bus tracking app/API |
| **NB** | New Brunswick campus cluster (4 sub-campuses) |
| **Scarlet Oracle** | Branded name for the Rutgers-GPT agent |
| **Truth layer** | Metadata on whether facts came from live API vs static corpus |
| **Execution contract** | Per-turn injected rules to prevent link dumps |

---

## 22. Contact & links

- **GitHub:** https://github.com/pulkitc804/Rutgers-GPT
- **Branch:** `cursor/oracle-response-formatting`
- **Local app:** http://localhost:3000
- **Ollama:** http://127.0.0.1:11434

---

*End of handoff. Update this file when merging to main or changing agent architecture.*
