/**
 * Embedding script: generates 768-dim vectors using HuggingFace Inference API.
 * Model: sentence-transformers/paraphrase-multilingual-mpnet-base-v2
 *   - multilingual (supports Estonian)
 *   - 768 dimensions — matches schema vector(768)
 *   - free tier available
 *
 * Usage:
 *   deno run --allow-net --allow-env scripts/embed-chunks.ts
 *
 * Env vars required:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY  (or SUPABASE_SERVICE_KEY)
 *   HF_TOKEN                   — huggingface.co/settings/tokens (read token)
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_KEY") ?? "";
const HF_TOKEN     = Deno.env.get("HF_TOKEN") ?? "";
const MODEL        = "sentence-transformers/paraphrase-multilingual-mpnet-base-v2";
const HF_URL       = `https://router.huggingface.co/hf-inference/models/${MODEL}/pipeline/feature-extraction`;
// Free tier: keep batches small to stay within rate limits
const BATCH_SIZE   = parseInt(Deno.env.get("EMBED_BATCH_SIZE") ?? "32");

if (!SUPABASE_URL || !SUPABASE_KEY || !HF_TOKEN) {
  console.error("Required: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_KEY), HF_TOKEN");
  Deno.exit(1);
}

interface Chunk { id: string; content_et: string; }

async function fetchUnembedded(offset: number, limit: number): Promise<Chunk[]> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/legal_chunks?select=id,content_et&embedding=is.null&limit=${limit}&offset=${offset}`,
    { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
  );
  if (!res.ok) throw new Error(`Fetch chunks failed: ${res.status}`);
  return res.json();
}

async function fetchTotalCount(): Promise<number> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/legal_chunks?select=id&embedding=is.null`,
    {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        Prefer: "count=exact",
        "Range-Unit": "items",
        Range: "0-0",
      },
    }
  );
  const contentRange = res.headers.get("content-range") ?? "*/0";
  return parseInt(contentRange.split("/")[1] ?? "0");
}

// HuggingFace Inference API — returns array of embedding arrays
// Handles "model loading" 503 responses with automatic retry
async function embedBatch(texts: string[], attempt = 1): Promise<number[][]> {
  const res = await fetch(HF_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${HF_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ inputs: texts, options: { wait_for_model: true } }),
  });

  // 503 = model cold start — HF needs a moment to warm up
  if (res.status === 503) {
    const wait = Math.min(20000, attempt * 5000);
    console.log(`  HF model loading, oota ${wait / 1000}s... (katse ${attempt})`);
    await new Promise((r) => setTimeout(r, wait));
    return embedBatch(texts, attempt + 1);
  }

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`HuggingFace API viga ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = await res.json() as number[][];

  // Sanity check: first embedding should have 768 dimensions
  if (data[0]?.length !== 768) {
    throw new Error(`Ootasin 768-dim vektorit, sain ${data[0]?.length ?? "?"}. Vale mudel?`);
  }

  return data;
}

async function updateEmbeddings(updates: Array<{ id: string; embedding: number[] }>) {
  // Supabase REST doesn't support bulk updates — patch individually in parallel
  const results = await Promise.allSettled(
    updates.map((u) =>
      fetch(`${SUPABASE_URL}/rest/v1/legal_chunks?id=eq.${u.id}`, {
        method: "PATCH",
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ embedding: `[${u.embedding.join(",")}]` }),
      })
    )
  );
  const failed = results.filter((r) => r.status === "rejected").length;
  if (failed > 0) console.warn(`  Hoiatus: ${failed} PATCH ebaõnnestus selles batches`);
}

// ── Main ─────────────────────────────────────────────────────────────────────

console.log(`\nMudel: ${MODEL} (768 dim, mitmekeelne)`);
const total = await fetchTotalCount();
console.log(`Chunk'e ilma vektorita: ${total}`);

if (total === 0) {
  console.log("Kõik chunk'id on juba vektoriseeritud.");
  Deno.exit(0);
}

console.log(`Batch suurus: ${BATCH_SIZE}. Alustame...\n`);

// Warm up the model before batch processing
console.log("Soojendame mudelit...");
try {
  await embedBatch(["test"]);
  console.log("Mudel valmis.\n");
} catch (e) {
  console.error(`Mudeli käivitamine ebaõnnestus: ${e}`);
  Deno.exit(1);
}

let processed = 0;
const startTime = Date.now();

// Always fetch from offset 0: once a chunk is embedded it leaves the
// "embedding IS NULL" result set, so the window shifts naturally.
// Using a fixed offset would skip chunks as the set shrinks.
while (true) {
  const chunks = await fetchUnembedded(0, BATCH_SIZE);
  if (chunks.length === 0) break;

  const texts = chunks.map((c) => c.content_et.slice(0, 512));

  let embeddings: number[][];
  try {
    embeddings = await embedBatch(texts);
  } catch (e) {
    console.error(`Batch ebaõnnestus: ${e}`);
    console.log("Ootan 10s ja proovin uuesti...");
    await new Promise((r) => setTimeout(r, 10000));
    try {
      embeddings = await embedBatch(texts);
    } catch (e2) {
      console.error(`Uuesti ebaõnnestumine, jätkan: ${e2}`);
      continue;
    }
  }

  await updateEmbeddings(chunks.map((c, i) => ({ id: c.id, embedding: embeddings[i] })));

  processed += chunks.length;
  const remaining = await fetchTotalCount();

  const pct = total > 0 ? Math.round(((total - remaining) / total) * 100) : 0;
  const elapsed = Math.round((Date.now() - startTime) / 1000);
  const eta = processed > 0 ? Math.round((elapsed / processed) * remaining) : "?";
  console.log(`[${pct}%] ${processed} töödeldud, ${remaining} jäänud — ${elapsed}s möödas, ~${eta}s jäänud`);

  // Stay within HF free tier rate limits
  await new Promise((r) => setTimeout(r, 250));
}

const totalTime = Math.round((Date.now() - startTime) / 1000);
console.log(`\nValmis! ${processed} chunk'i vektoriseeritud ${totalTime}s-ga.`);
console.log("Järgmine samm — lisa .env faili: VITE_HYBRID_ENABLED=true");
console.log("Seejärel käivita SQL editoris: SELECT tag_chunk_domains();");
