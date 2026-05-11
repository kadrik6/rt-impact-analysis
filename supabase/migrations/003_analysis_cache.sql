-- Analysis cache: avoids re-paying for identical AI requests
create table if not exists analysis_cache (
  id            uuid primary key default gen_random_uuid(),
  input_hash    text not null unique,        -- sha256(act_ids_sorted + draft_preview + prompt_version + model)
  act_ids       text[] not null,
  draft_preview text not null,               -- first 500 chars of draft, for human inspection
  model         text not null,
  prompt_version text not null default 'v1',
  ai_result     jsonb not null,
  input_tokens  int,
  output_tokens int,
  estimated_cost_usd numeric(10,6),
  created_at    timestamptz default now()
);

create index if not exists analysis_cache_hash_idx on analysis_cache (input_hash);
create index if not exists analysis_cache_created_idx on analysis_cache (created_at desc);
