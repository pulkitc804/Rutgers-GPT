# Rutgers-GPT — Rebuild Plan & Product Strategy

**Owner:** Pulkit Chaudhary
**Date:** 2026-06-28
**Status:** Active north-star. Update as we ship.
**Constraint:** $0 budget. Every choice below is free-tier or self-hosted.

---

## 0. The one-paragraph thesis

We are **not** building "Rutgers' own LLM." We are building the **most complete Rutgers
data layer in existence**, wired to a free best-in-class model and tools that take action.
The moat is the *data + tools + UX*, never the model weights. A free model with perfect,
complete, real-time Rutgers data beats GPT-5 with no Rutgers data — every time. That is the
whole bet.

---

## 1. Honest state of what exists (as of this doc)

Assessed from the real code, not the handoff doc.

| Component | Reality | Verdict |
|-----------|---------|---------|
| Schedule planner (`SchedulePlannerService.ts`, 406 LOC) | Real time-conflict solving across courses | **Keep — strongest asset** |
| 10 agent tools (live SOC / Passio / FoodPro) | All call real APIs, nothing stubbed | **Keep — harden** |
| Agent loop (dual LLM, prefetch, guards) | Solid architecture | **Keep — refactor** |
| RAG corpus (6 files, ~24KB) | Skeleton. Runs dry in 2 questions | **Rebuild — this is the gap** |
| Model (local `qwen2.5:7b`) | Hard intelligence ceiling | **Replace with free hosted** |
| Tests / timeouts / retries | None. Hangs feel like bugs | **Add — stability** |

**Bottom line:** ~70% of a real product. The missing 30% is *data depth, model quality,
and stability* — exactly the three things that make it feel "horrible" right now.

---

## 2. What kills the product if we ignore it

1. **Shallow knowledge** → "answer any niche question" is impossible with 6 docs.
2. **Weak local model** → "thinks on its own" is impossible on 7B.
3. **No stability layer** → slow/hanging tools read as "broken bot."

Everything in the roadmap targets one of these three.

---

## 3. Target architecture

```
                    ┌─────────────────────────────────────┐
                    │            Next.js Web App            │
                    │   Chat · Schedule grid · Dashboard    │
                    └───────────────────┬───────────────────┘
                                        │
                    ┌───────────────────▼───────────────────┐
                    │           Agent Orchestrator           │
                    │  intent → prefetch → tool loop → synth  │
                    └───┬───────────────┬───────────────┬────┘
                        │               │               │
            ┌───────────▼──┐   ┌────────▼───────┐  ┌────▼─────────┐
            │  MODEL LAYER  │   │   TOOL LAYER   │  │  RAG LAYER    │
            │ (swappable)   │   │ (live actions) │  │ (knowledge)   │
            ├───────────────┤   ├────────────────┤  ├──────────────┤
            │ Gemini Flash  │   │ SOC / planner  │  │ Vector DB     │
            │  (free tier)  │   │ Passio buses   │  │ (local, free) │
            │ Groq (free)   │   │ FoodPro dining │  │ Embeddings    │
            │ Ollama (local │   │ events / RMP   │  │ (free model)  │
            │  fallback)    │   │ campus info    │  │               │
            └───────────────┘   └────────────────┘  └──────┬───────┘
                                                            │
                                            ┌───────────────▼──────────────┐
                                            │   INGESTION PIPELINE (cron)   │
                                            │ crawler → clean → chunk →     │
                                            │ embed → vector DB             │
                                            │ sources: catalogs, r/rutgers, │
                                            │ RateMyProf, food/library/IT   │
                                            └──────────────────────────────┘
```

**Key change vs today:** a real **ingestion pipeline** feeding a real **vector DB**, and a
**swappable model layer** defaulting to a free hosted model.

---

## 4. Zero-budget model strategy (the "no money" answer)

| Tier | Provider | Cost | Use |
|------|----------|------|-----|
| Primary brain | **Google Gemini Flash** | Free (~1,500 req/day) | Reasoning, niche Q&A, schedules |
| Speed/fallback | **Groq (Llama)** | Free tier | Fast cheap turns |
| Offline dev | **Ollama `qwen2.5:7b`** | Free (local) | No-internet dev, privacy |
| Embeddings | **Gemini / `nomic-embed-text`** | Free | RAG vectors |

The orchestrator picks provider by env var. Switching brains = one config line, never a
rewrite. We *never* pay unless we choose to later for scale.

> Honesty note: Gemini Flash free tier rate limits will eventually bite at real user volume.
> That's a *good* problem — it only happens after we have users, and by then revenue
> (Section 7) covers it.

---

## 5. The data plan (this is the actual product)

Ranked by how much "Rutgers magic" each unlocks:

| Source | Unlocks | Method | Legal/risk |
|--------|---------|--------|-----------|
| SOC API ✅ | Courses, sections, times | Have it | Fine |
| **Course catalog** (catalogs.rutgers.edu) | Prereqs, descriptions, degree reqs | Crawler → markdown | Public |
| **r/rutgers** (Reddit) | Tribal knowledge: best profs, real tips | Reddit API (free) | Public, attribute |
| **RateMyProfessor / SIRS** | Professor quality signal | Scrape / unofficial API | Gray — cache, attribute |
| **food.rutgers.edu** | Dining hours, all halls | Crawler | Public |
| **libraries / IT / advising** | Hours, how-tos, policies | Crawler | Public |
| **getInvolved / events** | Clubs, events | API | Public |

**Pipeline = the product.** Crawl → clean → chunk → embed → store. Run on a cron. Each new
source = step-change in perceived intelligence. This is where most of the next month goes.

---

## 6. Roadmap (phased, each phase ships something usable)

### Phase 0 — Stabilize (≈2 days)
- Add timeouts + retries to every external fetch (SOC/Passio/FoodPro).
- Wire **Gemini Flash** as default brain (free); keep Ollama fallback.
- UI: loading/error states so slow tools never look "broken."
- **Done = the current app stops feeling broken.**

### Phase 1 — Real RAG (≈1 week)
- Stand up a free local vector DB (e.g. SQLite + sqlite-vec, or LanceDB — both $0).
- Build ingestion CLI: crawl course catalog + food + libraries/IT → chunk → embed → store.
- Swap keyword search for vector search.
- **Done = answers niche campus questions with citations.**

### Phase 2 — Tribal knowledge (≈1 week)
- Ingest r/rutgers + RateMyProfessor (with attribution + caching).
- Add `get_professor_intel` tool.
- **Done = "is Prof X good for 198:111?" gets a real answer. This is the wow moment.**

### Phase 3 — Killer schedule builder (≈1 week)
- Planner: prereq-aware (uses catalog), preference-aware (no 8ams, minimize gaps).
- Render the weekly grid visually in the UI, not just markdown.
- **Done = schedule-building is a reason to come back every term.**

### Phase 4 — Polish + beta (ongoing)
- Tests on planner + tools, structured logging, basic analytics.
- Closed beta with real Rutgers students; iterate on what they actually ask.

---

## 7. Path to profitable (later — not now)

Don't monetize until Phase 2+ is genuinely useful. Then, in order of realism:
1. **Freemium** — free core, paid ($3–5/mo student price) for advanced schedule optimization,
   unlimited niche Q&A, priority model.
2. **Campus org / club sponsorships** — featured events, "powered by."
3. **Anonymized, aggregate demand data** — which courses fill, what students struggle with
   (never personal data).
4. **License the engine** to other universities once the pipeline is generic.

Profitability follows usefulness. Usefulness follows data depth. So: **data first.**

---

## 8. Principles (how we work — no more Cursor blindness)

- **Always say where we are and what's blocking us.** Every step narrated.
- **Data > model.** Never train weights for knowledge; always RAG/tools.
- **$0 until users justify spend.** Free tiers, self-hosted, by default.
- **NB-only scope** (College Ave, Busch, Livingston, Cook/Douglass). No Newark/Camden.
- **Never invent facts** — bus times, menus, sections, prereqs come from tools or "I don't know."
- **Ship usable increments.** Each phase stands alone.

---

## 9. Immediate next step

Phase 0, item 1: stabilize fetches + wire the free Gemini brain. That converts the current
"horrible" feeling into "this works" in ~2 days, before we pour a week into data.

---

## 10. Security & accuracy

A full, red-teamed security + anti-hallucination plan lives in **[SECURITY-PLAN.md](SECURITY-PLAN.md)**
(produced by an 8-agent audit of the real code). It is the source of truth for protecting a
public, free-tier endpoint against spam/quota-exhaustion, SSRF, and confident-wrong answers.
Work it P0 → P1 → P2.
