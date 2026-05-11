-- Enable pgvector extension
create extension if not exists vector;

-- Legal chunks table
create table if not exists legal_chunks (
  id uuid primary key default gen_random_uuid(),
  act_id text not null,
  act_title text not null,
  act_type text not null default 'seadus',
  paragraph_nr text not null,
  content_et text not null,
  ministry_owner text not null default 'määramata',
  effective_from date,
  last_amended date,
  rt_identifier text not null,
  keywords text[] default '{}',
  embedding vector(768),
  created_at timestamptz default now()
);

-- Index for vector similarity search
create index if not exists legal_chunks_embedding_idx
  on legal_chunks using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- Index for keyword/act search
create index if not exists legal_chunks_act_id_idx on legal_chunks (act_id);
create index if not exists legal_chunks_ministry_idx on legal_chunks (ministry_owner);

-- Ministry mapping table
create table if not exists ministry_domains (
  id serial primary key,
  domain_keyword text not null unique,
  ministry_name text not null,
  ministry_short text not null,
  contact_point text
);

-- Seed: ministry domain mappings (expand as needed)
insert into ministry_domains (domain_keyword, ministry_name, ministry_short) values
  ('töö', 'Sotsiaalministeerium', 'SOM'),
  ('töölepingu', 'Sotsiaalministeerium', 'SOM'),
  ('äriühingu', 'Justiitsministeerium', 'JM'),
  ('äriseadustik', 'Justiitsministeerium', 'JM'),
  ('riigieelarve', 'Rahandusministeerium', 'RAM'),
  ('maks', 'Rahandusministeerium', 'RAM'),
  ('ehitus', 'Kliimaministeerium', 'KLM'),
  ('keskkonnaload', 'Kliimaministeerium', 'KLM'),
  ('haridus', 'Haridus- ja Teadusministeerium', 'HTM'),
  ('isikuandm', 'Justiitsministeerium', 'JM'),
  ('andmekaitse', 'Justiitsministeerium', 'JM'),
  ('riigihange', 'Rahandusministeerium', 'RAM'),
  ('avalik teenistus', 'Rahandusministeerium', 'RAM'),
  ('digiteenused', 'Majandus- ja Kommunikatsiooniministeerium', 'MKM')
on conflict do nothing;

-- RPC function for hybrid search
create or replace function match_legal_chunks(
  query_text text,
  match_count int default 15
)
returns table (
  id uuid,
  act_id text,
  act_title text,
  act_type text,
  paragraph_nr text,
  content_et text,
  ministry_owner text,
  effective_from date,
  last_amended date,
  rt_identifier text,
  keywords text[],
  similarity float
)
language sql stable
as $$
  -- Keyword search component (acts that match text directly)
  with keyword_matches as (
    select lc.*, 0.9 as kw_score
    from legal_chunks lc
    where lc.content_et ilike '%' || query_text || '%'
       or lc.act_title ilike '%' || query_text || '%'
    limit 50
  )
  select
    lc.id, lc.act_id, lc.act_title, lc.act_type, lc.paragraph_nr,
    lc.content_et, lc.ministry_owner, lc.effective_from, lc.last_amended,
    lc.rt_identifier, lc.keywords,
    1.0 as similarity
  from keyword_matches lc
  limit match_count;
$$;
