# rt-impact-analysis

Estonian Legislative Impact Analysis tool. RAG system over Riigi Teataja corpus.

## What this does
Given a legislative draft (eelnõu), identifies:
- Existing acts that are affected
- Which ministries own those acts
- Specific paragraphs that may conflict or need amendment
- Confidence score with citation for every claim

## Architecture
1. **Ingest** (`scripts/ingest-rt.ts`): fetches RT XML API → parses by paragraph → embeds → stores in Supabase pgvector
2. **Retrieve** (`src/lib/retrieval.ts`): Claude haiku extracts entities from draft → hybrid vector+keyword search
3. **Analyse** (`src/lib/claude.ts`): Claude opus gets retrieved chunks + draft → structured JSON output with strict citation rules
4. **UI** (`src/App.tsx`): two-panel layout, human-in-loop confirm/flag per result

## Critical constraints
- NEVER cite an RT identifier not present in retrieved context
- Every paragraph reference must match the exact RT paragraph numbering format
- confidence < 0.7 → goes to "unresolved", not into affected_acts

## Running locally
1. Copy `.env.example` → `.env`, fill in keys
2. `npm install`
3. Run Supabase migration: `supabase/migrations/001_pgvector_schema.sql`
4. `npm run ingest` — fetches first 50 acts in tööõigus domain
5. `npm run dev`

## Current status
MVP — ingestion pipeline and UI scaffolded. RT API XML parsing needs validation against actual RT response format before first real ingest run.

## Next steps
1. Validate RT API response format (check actual XML structure at riigiteataja.ee/api/)
2. Run ingest on tööõigus domain, test retrieval quality
3. Replace keyword-fallback RPC with full vector similarity search once embeddings populated
4. Add Word/PDF export for ministry workflow integration
