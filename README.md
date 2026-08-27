# CX Reply Assistant — Datastraw Assessment (Part 1)

An AI-assisted reply drafting tool for CX agents. Given a customer conversation,
brand, and order, it retrieves relevant brand policy, grounds the model in
computed facts about the order (e.g. days since delivery vs. policy windows),
generates a draft reply, and lets the agent edit / regenerate / approve before
"sending." Every generation is logged for audit.

**Scenario implemented:** the exact one in the brief — *"My order was
delivered but the bottle is broken. What can I do?"* — plus a second seeded
guardrail scenario (a refund request 20 days after delivery, outside the
7-day change-of-mind window) to demonstrate the AI declining to over-promise.

## Stack

- **Next.js 14** (App Router) — single deployable app, frontend + API routes together
- **Neon Postgres** — serverless Postgres, `@neondatabase/serverless` HTTP driver (no connection pooling to manage)
- **OpenRouter** — LLM provider, model configurable via env var
- Plain CSS (design tokens in `app/globals.css`), no UI framework

Why this instead of the full listed stack (Supabase/Qdrant/etc.): at one
brand and four KB documents, a vector store buys nothing over keyword
retrieval, and Supabase Auth isn't needed for a single-agent demo. `PART2_ARCHITECTURE.md`
explains exactly where Qdrant, queues, and RLS-based tenant isolation get
introduced as the system scales to 500 brands.

## How it works

1. **Conversation view** (`app/page.tsx` + `app/ConversationView.tsx`) — customer,
   brand, order, message thread, loaded via `GET /api/conversation`.
2. **Knowledge base retrieval** (`lib/retrieval.ts`) — keyword-matches the
   customer's message against KB categories (return/refund/shipping/cancellation).
   Falls back to the full KB if nothing matches (flagged low-confidence),
   rather than generating with zero context.
3. **Grounding** (`lib/retrieval.ts` → `buildGroundingNotes`) — parses "within
   N days" policy language and computes the actual days-since-delivery for
   the order, producing explicit facts like *"Policy allows action within 7
   days. This order is OUTSIDE that window (20 days elapsed)"*. These are
   handed to the model as ground truth instead of relying on it to do date
   arithmetic correctly.
4. **Generation** (`lib/llm.ts`, `POST /api/generate-reply`) — a system prompt
   that hard-constrains the model to only state policy facts present in the
   retrieved context, and to decline confidently promising outcomes the
   context/grounding notes don't support.
5. **Guardrail flag** (`isLowConfidence`) — independent of what the model
   says about itself: if retrieval couldn't match a topic, or a date check
   came back outside a policy window, the UI shows a warning banner.
6. **Agent actions** — edit the draft inline, regenerate, or approve. Approving
   (`POST /api/approve`) logs the final text and appends it to the conversation
   as an agent message. No actual WhatsApp/email is sent, per the brief.
7. **Logging** — every generation writes a full row to `ai_reply_logs`:
   customer message, retrieved context (JSON), AI response, agent-edited
   response (if changed), final response, status, low-confidence flag, model,
   timestamp.

## Setup

```bash
npm install
cp .env.example .env.local   # fill in DATABASE_URL and OPENROUTER_API_KEY
npm run seed                 # applies db/schema.sql and inserts demo data
npm run dev                  # http://localhost:3000
```

- `DATABASE_URL` — a Neon connection string (Neon dashboard → Connection Details).
- `OPENROUTER_API_KEY` — from https://openrouter.ai/keys
- `OPENROUTER_MODEL` — optional, defaults to `anthropic/claude-haiku-4.5`.

`npm run seed` is idempotent for the demo brand: it deletes and re-inserts the
`HydroBloom` brand and its data each time, so it's safe to re-run.

## Deploying

Any Next.js host works (Vercel is the path of least resistance since Neon
has a first-class integration):

1. Push this repo to GitHub.
2. Import it into Vercel.
3. Add `DATABASE_URL`, `OPENROUTER_API_KEY`, `OPENROUTER_MODEL` as environment variables.
4. Deploy. Then run `npm run seed` once locally (pointed at the same
   `DATABASE_URL`) to populate the production database, or trigger it via a
   one-off script/command in your host of choice.

## Project structure

```
app/
  page.tsx                 server shell (topbar)
  ConversationView.tsx      client component — conversation + AI assist panel
  api/
    conversation/route.ts   GET conversation view
    generate-reply/route.ts POST — retrieval + guardrails + LLM + logging
    approve/route.ts        POST — save final response, append to thread
  globals.css               design tokens
lib/
  db.ts                     Neon client
  retrieval.ts              keyword retrieval + grounding notes + confidence flag
  llm.ts                    OpenRouter call + system prompt
db/
  schema.sql                full schema (brands, kb, customers, orders, conversations, messages, ai_reply_logs)
scripts/
  seed.mjs                  applies schema + inserts demo data
```

## Database schema

See `db/schema.sql`. Summary:

- `brands` — one row per brand (name, tone guidelines)
- `knowledge_base` — brand-scoped policy documents (category, title, content)
- `customers`, `orders` — mock CRM data, scoped to brand
- `conversations`, `messages` — the conversation thread
- `ai_reply_logs` — full audit trail per generated reply

All brand-owned tables carry a `brand_id` foreign key; Part 2 of the
architecture doc covers how this becomes the enforcement boundary (via
Postgres RLS) at multi-tenant scale.
