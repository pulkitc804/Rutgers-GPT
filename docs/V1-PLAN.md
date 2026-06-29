# Rutgers-GPT v1 — Plan of Record

**Source:** multi-agent strategy council (infra/cost, retrieval, product, red-team lenses + synthesis), 2026-06-29.
**Companion to:** [REBUILD-PLAN.md](REBUILD-PLAN.md), [SECURITY-PLAN.md](SECURITY-PLAN.md).

## The verdict
Ship a **narrow, fast, never-wrong campus utility** — NOT "ChatGPT for Rutgers." Nail 3 deterministic
killer flows + a **grounded-or-abstain** Q&A path. Kill the "answer anything, detailed like Claude,
reliably, for free" promise — it's an impossible quadrilateral and the root of the throttling pain.
Stay on **gpt-oss-20b**; the genuine reliability unlock is **adding a card to Groq (~$8–15/mo, hard $20 cap)**
for ~10× rate limits — but do the **free mechanical token fixes first** (they recover ~4k tokens/turn).

## The token math (resolved)
The "busy" wall is NOT search — it was the **schedule path injecting 12k chars of raw JSON** (~3k wasted
tokens/turn) plus always-on tool schemas (~1k). Fixing those mechanically recovers ~4k tokens/turn at zero
quality cost. The free ceiling is 8k tokens/MINUTE (~2 turns/min); the paid Developer tier lifts it to ~80k+.

## v1 scope — 3 killer flows (deterministic, can't hallucinate, ~0 model tokens)
1. **Build/validate my schedule** — conflict-free, real sections, **visual weekly grid** (engine exists). Retention hook.
2. **"When's my bus / worth walking?"** — live Passio ETAs. Daily habit.
3. **"What's open / good to eat now?"** — live FoodPro dining. Daily habit.

Everything else = grounded answer with a source link, or honest "I don't have a verified answer — here's the
official page." Never "ask me anything."

**CUT:** the "answer anything like Claude" framing; extension/mobile (freeze); gpt-oss-120b on free tier;
fine-tuning; a real vector DB; r/rutgers + RateMyProf scraping; monetization; OpenRouter.

## Reliability bar (measure server-side)
- Latency P50 < 3s, P95 < 8s for the 3 flows.
- ≥97% of requests return a useful answer **or honest pointer** (not "busy").
- **Zero-fabrication** on course codes / section numbers / bus routes / dates — enforced as a **code path**
  (abstention), not just a prompt, with a CI adversarial suite.
- **Degraded mode:** if the model budget blows, the deterministic tools still work with zero model calls.

## Roadmap
**P0 — security blockers (before any public URL / before adding the Groq card):**
1. Next.js middleware: per-IP + global rate limiter, **fail closed** (Upstash free / in-memory).
2. Cloudflare Turnstile + Origin/Referer check.
3. Content-Length cap before `req.json()`.
4. Harden SOC/dining proxies: param allowlist (no raw querystring passthrough), drop 64MB cap → ~5MB, cache per-term catalog 30–60 min.
5. Hard monthly spend cap + billing alert in Groq console.

**P1 — token/reliability unlock:**
6. Add card to Groq → Developer tier (~10× TPM). ⟵ the structural unlock (user decision).
7. ✅ Kill schedule token bomb (compact summary). *(done)*
8. ✅ Drop tool schemas on prefetch-satisfied turns. *(done)*
9. ✅ Server-side response cache for search/RAG. *(done — search cache; RAG/FAQ cache TODO)*
10. ✅ Fix stale TPM comment. *(done)*

**P2 — retrieval quality & the wow:**
11. **Visual weekly schedule grid in the UI** (currently markdown text). Highest-leverage "wow"; engine exists.
12. Build-time Gemini embedding index (`vectors.json`, committed) → replaces the dead Ollama reranker; re-chunk corpus to ~600–900 char windows.
13. Replace uncalibrated `score >= 1.5` gate with a cosine threshold (~0.55).
14. UI: 3 tappable entry chips ("Build my schedule" / "When's my bus?" / "What's open?").
15. Instrument: log `{flow, latency, provider, was_busy, abstained, tool_called}` + thumbs-down.

**P3 — launch:** stamp corpus docs with `last_verified`; post the schedule-grid demo to r/rutgers timed to
registration week; recruit 20–30 beta users. Success = return during add/drop + unprompted shares.

## Top risks
- **Abuse/cost** (unauth endpoint drains quota or, post-card, runs a bill) → P0 middleware + Turnstile + spend cap before the card.
- **ToS/legal** (proxies hammer Rutgers; DDG datacenter-IP scraping returns []) → param allowlist + caching; demote DDG to cached best-effort, migrate to Brave API.
- **Hallucination despite grounding** → abstention as a code path + CI adversarial suite.
- **Stale corpus** → `last_verified` stamps + "confirm on official page."
- **Registration-week spike** → fail-closed ceiling degrades to deterministic tools, not a dark page.
