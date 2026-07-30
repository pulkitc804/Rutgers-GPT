# Autonomous Session Results — RAG Corpus Build

**Date:** 2026-06-28, ~5:22–8:19 PM EDT (autonomous while owner was out)
**Branch / PR:** `feat/web-stabilize-gemini-security` → [PR #2](https://github.com/pulkitc804/Rutgers-GPT/pull/2)

## TL;DR
The agent went from "can only answer buses/dining/calendar" to **answering broad,
niche Rutgers questions accurately, grounded in 34 official-source corpus docs, in
under 1 second.** No model training — the win is data + retrieval + token discipline.

---

## What changed

### 1. Knowledge corpus: 6 → 34 documents
Built a real ingestion pipeline (`scripts/ingest-corpus.mjs`) that fetches official
rutgers.edu pages, strips nav junk, gates on content weight, and writes RAG corpus
chunks with source URLs. Now covers: academic calendar, summer/winter session,
registrar, transcripts, financial aid, tuition & fees, billing/payments, payment
plans, refunds, dining, parking, IT help, Canvas, libraries, student success,
learning centers, NB academics, housing, residence life, health services, CS dept,
CS undergrad, careers, involvement, dean of students, graduation, Scarlet Hub.

Re-runnable any time: `node scripts/ingest-corpus.mjs`.

### 2. Fast on a free tier (the hard part)
Groq's free tier is **8,000 tokens/minute**. A 2-call tool turn blew past it
(responses took 23–46s). Fixes:
- Trimmed the system prompt **1788 → 626 tokens**, removed a duplicate agent
  directive, shortened tool descriptions.
- **Prefetch RAG server-side** for general questions so the model answers in **one
  call** instead of calling the search tool itself.
- `fetchWithGuard` honors `Retry-After`; gpt-oss citation artifacts stripped.

Result: knowledge answers dropped from ~23–46s to **~0.7–1.1s**.

### 3. Reliable brain
`openai/gpt-oss-20b` on Groq (free) — correct structured tool calls. (llama-3.3-70b
mis-formats tool calls on Groq and was unusable.)

---

## Before → After (real outputs)

| Question | Before | After (grounded, this session) |
|----------|--------|--------------------------------|
| "How do I apply for financial aid?" | *no answer / guess* | NetID login → Net Price Calculator → FAFSA/NJ-Aid → aid offer → One-Stop, w/ official links — **1.1s** |
| "Where can I get free tutoring?" | *not in corpus* | Learning Centers on all 4 NB campuses, 50+ courses, 1:1/group/workshops — **0.7s** |
| "What does Career Services offer?" | *not in corpus* | RICC (deadlines Jun 15 / Sep 8), Career Closet, events, 2026 award — **0.7s** |
| "Fall 2026 start date?" | *guessed* | "Tuesday, September 1, 2026" via live academic-calendar lookup |
| "What's good at the Atrium?" | hallucinated | real FoodPro menu + correct College Ave campus |

All answers cite their official source and use a natural voice (no AI-slop template,
no "Truth confidence:" line).

---

## Honest caveats
- **Free-tier token limit** still bites under rapid bursts (many questions in one
  minute) — it self-recovers in seconds, but a real public launch needs the
  rate-limiting + caching in [SECURITY-PLAN.md](SECURITY-PLAN.md).
- **Some pages are JS-rendered** (skipped or thin): NetID, a few sub-pages. Their
  info is partly covered by hubs; `search_rutgers_web` fetches others live.
- **Model can over-elaborate** on sparse corpus (e.g. CS course specifics) — it cites
  the source, but deeper per-department corpus would tighten this.

## Next levers (not done)
- More corpus depth (per-department, club/event data, r/rutgers, RateMyProf).
- Embedding-based retrieval (currently keyword) for better recall.
- P0 security hardening before any public launch.
