/**
 * One-time ingest script: fetches all acts from the RT catalog,
 * parses them into chunks, and stores them in legal_chunks.
 *
 * Usage:
 *   deno run --allow-net --allow-env scripts/ingest-chunks.ts
 *
 * Env vars required:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Options (env):
 *   INGEST_LIMIT=50       — max acts to process per run (default: all)
 *   INGEST_SKIP_EXISTING  — if "true", skip acts already in ingested_acts (default: true)
 */

import { parseActXml, extractActMeta } from "../supabase/functions/_shared/parser.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_KEY") ?? "";
const LIMIT = parseInt(Deno.env.get("INGEST_LIMIT") ?? "9999");
const SKIP_EXISTING = Deno.env.get("INGEST_SKIP_EXISTING") !== "false";
const RT_BASE = "https://www.riigiteataja.ee/akt";
const CATALOG_URL = "https://www.riigiteataja.ee/lyhendid.html";

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  Deno.exit(1);
}

interface Act { id: string; title: string; lyhend: string; }

async function fetchCatalog(): Promise<Act[]> {
  console.log("Fetching RT catalog...");
  const res = await fetch(CATALOG_URL, {
    headers: { "Accept-Language": "et-EE,et;q=0.9", "User-Agent": "Mozilla/5.0" },
  });
  if (!res.ok) throw new Error(`Catalog fetch failed: ${res.status}`);
  const html = await res.text();

  const tbody = html.match(/<tbody>([\s\S]*?)<\/tbody>/i)?.[1] ?? "";
  const acts: Act[] = [];
  const rowRegex = /<tr[\s\S]*?<\/tr>/gi;
  let row: RegExpExecArray | null;
  while ((row = rowRegex.exec(tbody)) !== null) {
    const idMatch = row[0].match(/href="[^"]*\/akt\/(\d{6,})"[^>]*>([^<]+)<\/a>/);
    const lyhendMatch = row[0].match(/href="[^"]*\/akt\/([A-ZÜÕÖÄ][A-ZÜÕÖÄa-züõöä0-9\-]{1,20})"[^>]*>([^<]+)<\/a>/);
    if (!idMatch) continue;
    acts.push({
      id: idMatch[1],
      title: idMatch[2].trim(),
      lyhend: lyhendMatch ? lyhendMatch[2].trim() : "",
    });
  }
  console.log(`Found ${acts.length} acts in catalog`);
  return acts;
}

async function getIngestedIds(): Promise<Set<string>> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/ingested_acts?select=act_id`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  });
  if (!res.ok) return new Set();
  const rows = await res.json() as Array<{ act_id: string }>;
  return new Set(rows.map((r) => r.act_id));
}

function guessMinistry(title: string, lyhend: string): string {
  const t = title.toLowerCase();
  const LYHEND_MAP: Record<string, string> = {
    TLS: "Sotsiaalministeerium", SHS: "Sotsiaalministeerium", RaKS: "Sotsiaalministeerium",
    ÄS: "Justiitsministeerium", IKS: "Justiitsministeerium", AvTS: "Justiitsministeerium",
    ATS: "Rahandusministeerium", MKS: "Rahandusministeerium", RHS: "Rahandusministeerium",
    KKS: "Kliimaministeerium", EhS: "Kliimaministeerium", PlanS: "Kliimaministeerium",
    KVTS: "Kaitseministeerium", VS: "Siseministeerium", PGS: "Siseministeerium",
    HaS: "Haridus- ja Teadusministeerium", ÜKS: "Haridus- ja Teadusministeerium",
  };
  if (LYHEND_MAP[lyhend]) return LYHEND_MAP[lyhend];
  if (t.includes("tööleping") || t.includes("sotsiaalhoolekande")) return "Sotsiaalministeerium";
  if (t.includes("andmekaitse") || t.includes("äriseadustik")) return "Justiitsministeerium";
  if (t.includes("riigieelarve") || t.includes("maksukorraldus")) return "Rahandusministeerium";
  if (t.includes("ehitus") || t.includes("keskkond")) return "Kliimaministeerium";
  if (t.includes("haridus") || t.includes("ülikool")) return "Haridus- ja Teadusministeerium";
  if (t.includes("kaitse") || t.includes("riigikaitse")) return "Kaitseministeerium";
  return "määramata";
}

async function ingestAct(act: Act): Promise<number> {
  let xml: string;
  try {
    const res = await fetch(`${RT_BASE}/${act.id}.xml`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    xml = await res.text();
  } catch (e) {
    console.warn(`  SKIP ${act.id} (${act.title}): fetch failed — ${e}`);
    return 0;
  }

  const { rt_identifier } = extractActMeta(xml);
  const ministry = guessMinistry(act.title, act.lyhend);
  const chunks = parseActXml(xml, act.title, rt_identifier || act.id, ministry);

  if (chunks.length === 0) {
    console.warn(`  SKIP ${act.id} (${act.title}): no chunks parsed`);
    return 0;
  }

  // Upsert chunks in batches of 50
  const BATCH = 50;
  for (let i = 0; i < chunks.length; i += BATCH) {
    const batch = chunks.slice(i, i + BATCH).map((c) => ({
      act_id: act.id,
      act_title: c.act_title,
      act_type: "seadus",
      paragraph_nr: c.paragraph_nr,
      content_et: c.content_et,
      ministry_owner: c.ministry_owner,
      rt_identifier: c.rt_identifier,
    }));

    const res = await fetch(`${SUPABASE_URL}/rest/v1/legal_chunks`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "resolution=ignore-duplicates",
      },
      body: JSON.stringify(batch),
    });
    if (!res.ok) {
      const err = await res.text();
      console.warn(`  Batch insert failed for ${act.id}: ${err.slice(0, 100)}`);
    }
  }

  // Record in ingested_acts
  await fetch(`${SUPABASE_URL}/rest/v1/ingested_acts`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates",
    },
    body: JSON.stringify({
      act_id: act.id,
      act_title: act.title,
      lyhend: act.lyhend,
      chunk_count: chunks.length,
    }),
  });

  return chunks.length;
}

// ── Main ─────────────────────────────────────────────────────────────────────

const catalog = await fetchCatalog();
const ingestedIds = SKIP_EXISTING ? await getIngestedIds() : new Set<string>();

const todo = catalog
  .filter((a) => !ingestedIds.has(a.id))
  .slice(0, LIMIT);

console.log(`\nIngesting ${todo.length} acts (${ingestedIds.size} already done, limit=${LIMIT})`);

let totalChunks = 0;
let done = 0;

for (const act of todo) {
  const n = await ingestAct(act);
  totalChunks += n;
  done++;
  if (n > 0) console.log(`[${done}/${todo.length}] ${act.title} — ${n} chunks`);
  // Polite delay to avoid hammering RT
  await new Promise((r) => setTimeout(r, 300));
}

console.log(`\nDone. ${done} acts processed, ${totalChunks} chunks stored.`);
console.log("Next step: run embed-chunks.ts to generate embeddings.");
