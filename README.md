# Rutgers-GPT

An AI assistant scoped to Rutgers–New Brunswick. It answers questions about majors, academics, dining, buses, policies, and campus services by retrieving from a curated corpus of official Rutgers pages, and it can look up live schedule-of-classes data through a planner tool — so answers stay grounded instead of hallucinated.

> Status: **active development.** Interfaces, the corpus, and the agent are still changing.

## What it does

- **Grounded Q&A (RAG).** Retrieval-augmented generation over a corpus of official Rutgers pages (majors and degree requirements, academic policies, dining, bus routes, financial aid, campus services). Answers draw on the corpus rather than inventing details.
- **Schedule-of-Classes planner.** A hardened proxy to the Rutgers SOC data (New Brunswick scope, parameter allowlist, term caching) for course and schedule questions.
- **Multi-provider LLM backend.** Pluggable providers (Gemini, Groq, Ollama, Anthropic) with fallback so a single rate limit does not break a conversation.
- **Markdown chat UI.** Tables and formatted responses (for example, schedule grids and major requirements render as styled tables).

                                                        ## Architecture

                                                        A TypeScript monorepo (Turborepo + npm workspaces):

                                                        - `apps/web` — Next.js chat app (the main interface): chat API, RAG pipeline, SOC planner.
                                                        - `apps/extension` — browser side-panel extension client.
                                                        - `apps/mobile` — React Native / Expo client.
                                                        - `packages/shared` — shared AI provider abstraction, agent runtime, and tools.

                                                        **Stack:** TypeScript, Next.js, React, Tailwind CSS, Framer Motion, Turborepo; RAG with Gemini/Ollama embeddings and vector search; multi-provider LLM layer.

                                                        ## Running locally

                                                        This is a monorepo managed with Turborepo.

                                                        ```bash
                                                        npm install
                                                        npm run dev:web
                                                        ```

                                                        Copy `apps/web/.env.example` and provide your own API keys for whichever LLM provider(s) you want to use. No keys are committed to this repo.

                                                        ## Status & scope

                                                        Rutgers-GPT is a work in progress and currently scoped to Rutgers–New Brunswick. The corpus, agent behavior, and clients are actively evolving.
                                                        
