-- Add domain column to legal_chunks for vector search filtering
ALTER TABLE legal_chunks ADD COLUMN IF NOT EXISTS domain text;
CREATE INDEX IF NOT EXISTS legal_chunks_domain_idx ON legal_chunks (domain);

-- Also track which acts have been ingested (to avoid re-fetching)
CREATE TABLE IF NOT EXISTS ingested_acts (
  act_id       text PRIMARY KEY,
  act_title    text NOT NULL,
  lyhend       text NOT NULL DEFAULT '',
  domain       text,
  chunk_count  int  NOT NULL DEFAULT 0,
  ingested_at  timestamptz DEFAULT now()
);

-- Derive domain from act_title / lyhend heuristics.
-- Run after ingest to tag existing chunks.
CREATE OR REPLACE FUNCTION tag_chunk_domains() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE legal_chunks SET domain = CASE
    WHEN act_title ILIKE '%hasartmäng%'                                    THEN 'hasartmang'
    WHEN act_title ILIKE '%käibemaks%'                                     THEN 'kaibemaks'
    WHEN act_title ILIKE '%tulumaks%'                                      THEN 'tulumaks'
    WHEN act_title ILIKE '%aktsiis%'                                       THEN 'aktsiis'
    WHEN act_title ILIKE '%töölepingu%' OR act_title ILIKE '%töösuhe%'     THEN 'tooigus'
    WHEN act_title ILIKE '%sotsiaalhoolekande%' OR act_title ILIKE '%pension%' THEN 'sotsiaaloigus'
    WHEN act_title ILIKE '%andmekaitse%' OR act_title ILIKE '%isikuandme%' THEN 'andmekaitse'
    WHEN act_title ILIKE '%kaitseväe%' OR act_title ILIKE '%riigikaitse%'  THEN 'riigikaitse'
    WHEN act_title ILIKE '%kriminaal%' OR act_title ILIKE '%väärteo%'      THEN 'kriminaalmenetus'
    WHEN act_title ILIKE '%riigieelarve%' OR act_title ILIKE '%maksukorraldus%' THEN 'rahandus'
    WHEN act_title ILIKE '%hange%' OR act_title ILIKE '%riigihange%'       THEN 'riigihanked'
    WHEN act_title ILIKE '%ehitus%' OR act_title ILIKE '%planeeri%'        THEN 'ehitus'
    WHEN act_title ILIKE '%keskkond%' OR act_title ILIKE '%looduskaitse%'  THEN 'keskkond'
    WHEN act_title ILIKE '%haridus%' OR act_title ILIKE '%ülikool%'        THEN 'haridus'
    WHEN act_title ILIKE '%politsei%' OR act_title ILIKE '%piirivalve%'    THEN 'siseturvalisus'
    WHEN act_title ILIKE '%äriseadustik%' OR act_title ILIKE '%äriühingu%' THEN 'ariigus'
    WHEN ministry_owner = 'Sotsiaalministeerium'                            THEN 'sotsiaaloigus'
    WHEN ministry_owner = 'Rahandusministeerium'                            THEN 'rahandus'
    WHEN ministry_owner = 'Justiitsministeerium'                            THEN 'oigusemoistelmine'
    WHEN ministry_owner = 'Kaitseministeerium'                              THEN 'riigikaitse'
    WHEN ministry_owner = 'Kliimaministeerium'                              THEN 'keskkond'
    WHEN ministry_owner = 'Haridus- ja Teadusministeerium'                  THEN 'haridus'
    ELSE 'muu'
  END
  WHERE domain IS NULL;
END;
$$;
