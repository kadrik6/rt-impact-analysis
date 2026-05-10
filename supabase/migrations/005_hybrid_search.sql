-- Replace the placeholder match_legal_chunks with a real vector similarity RPC.
-- Takes a pre-computed query embedding and returns the most semantically similar chunks.
-- Used by the hybrid search flow: embed draft → vector search → deterministic scoring.

CREATE OR REPLACE FUNCTION match_legal_chunks(
  query_embedding vector(768),
  match_count     int     DEFAULT 40,
  filter_domain   text    DEFAULT NULL
)
RETURNS TABLE (
  id            uuid,
  act_id        text,
  act_title     text,
  paragraph_nr  text,
  content_et    text,
  ministry_owner text,
  rt_identifier text,
  domain        text,
  similarity    float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    lc.id,
    lc.act_id,
    lc.act_title,
    lc.paragraph_nr,
    lc.content_et,
    lc.ministry_owner,
    lc.rt_identifier,
    lc.domain,
    1 - (lc.embedding <=> query_embedding) AS similarity
  FROM legal_chunks lc
  WHERE lc.embedding IS NOT NULL
    AND (filter_domain IS NULL OR lc.domain = filter_domain)
  ORDER BY lc.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- Index hint: ensure ivfflat index exists for fast ANN search
CREATE INDEX IF NOT EXISTS legal_chunks_embedding_idx
  ON legal_chunks USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);
