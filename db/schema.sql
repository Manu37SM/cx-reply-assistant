-- CX Reply Assistant schema (Postgres / Neon)

create extension if not exists pgcrypto;

create table if not exists brands (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  tone          text not null default 'Friendly, concise, empathetic. Sign off as "Team {brand}".',
  created_at    timestamptz not null default now()
);

-- Brand knowledge base. Category is used for simple keyword-based retrieval
-- at this scale; Part 2 of the assessment describes how this becomes a
-- vector-indexed store (Qdrant) once brand count grows.
create table if not exists knowledge_base (
  id            uuid primary key default gen_random_uuid(),
  brand_id      uuid not null references brands(id) on delete cascade,
  category      text not null check (category in ('return','refund','shipping','cancellation')),
  title         text not null,
  content       text not null,
  created_at    timestamptz not null default now()
);

create table if not exists customers (
  id            uuid primary key default gen_random_uuid(),
  brand_id      uuid not null references brands(id) on delete cascade,
  name          text not null,
  email         text,
  created_at    timestamptz not null default now()
);

create table if not exists orders (
  id              uuid primary key default gen_random_uuid(),
  brand_id        uuid not null references brands(id) on delete cascade,
  customer_id     uuid not null references customers(id) on delete cascade,
  order_number    text not null,
  product_name    text not null,
  status          text not null default 'delivered',
  delivered_at    timestamptz,
  created_at      timestamptz not null default now()
);

create table if not exists conversations (
  id            uuid primary key default gen_random_uuid(),
  brand_id      uuid not null references brands(id) on delete cascade,
  customer_id   uuid not null references customers(id) on delete cascade,
  order_id      uuid references orders(id) on delete set null,
  status        text not null default 'open',
  created_at    timestamptz not null default now()
);

create table if not exists messages (
  id                uuid primary key default gen_random_uuid(),
  conversation_id   uuid not null references conversations(id) on delete cascade,
  sender            text not null check (sender in ('customer','agent','ai')),
  content           text not null,
  created_at        timestamptz not null default now()
);

-- Full audit trail for every AI-assisted reply, per assessment "Data & Logging" spec.
create table if not exists ai_reply_logs (
  id                     uuid primary key default gen_random_uuid(),
  conversation_id        uuid not null references conversations(id) on delete cascade,
  customer_message       text not null,
  retrieved_context      jsonb not null default '[]',
  ai_response            text,
  agent_edited_response  text,
  final_response         text,
  status                 text not null default 'generated' check (status in ('generated','edited','approved')),
  low_confidence         boolean not null default false,
  model                  text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index if not exists idx_kb_brand_category on knowledge_base(brand_id, category);
create index if not exists idx_messages_conversation on messages(conversation_id, created_at);
create index if not exists idx_logs_conversation on ai_reply_logs(conversation_id, created_at);
