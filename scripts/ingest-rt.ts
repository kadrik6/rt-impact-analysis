/**
 * Riigi Teataja ingestion pipeline
 *
 * Usage: npm run ingest
 *
 * RT XML has two formats:
 *   - Structured seadused: <paragrahv><loige><tavatekst>
 *   - Simple määrused:     <HTMLKonteiner><![CDATA[<p><b>§ N.</b>...
 */

import { createClient } from "@supabase/supabase-js";
import { XMLParser } from "fast-xml-parser";

const SUPABASE_URL = process.env.SUPABASE_URL ?? "";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY ?? "";
const HF_TOKEN = process.env.HF_TOKEN ?? "";

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const RT_BASE = "https://www.riigiteataja.ee/akt";

// ─── Curated act list ────────────────────────────────────────────────────────
// Find act IDs: open any act at riigiteataja.ee, the numeric ID is in the URL.

const ACTS = [
  {
    id: "13198475",
    title: "Töölepingu seadus",
    rt_identifier: "RT I 2009, 5, 35",
    act_type: "seadus",
    ministry_owner: "Sotsiaalministeerium",
  },
  // Add more:
  // { id: "...", title: "Äriseadustik", rt_identifier: "RT I 1995, 26, 355",
  //   act_type: "seadus", ministry_owner: "Justiitsministeerium" },
] as const;

// ─── Types ───────────────────────────────────────────────────────────────────

interface ParsedChunk {
  act_id: string;
  act_title: string;
  act_type: string;
  paragraph_nr: string;
  content_et: string;
  rt_identifier: string;
  ministry_owner: string;
  effective_from: string | null;
  last_amended: string | null;
  keywords: string[];
}

type ActMeta = (typeof ACTS)[number];

// ─── XML parser ───────────────────────────────────────────────────────────────

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "_",
  cdataPropName: "__cdata",
  textNodeName: "#text",
  parseTagValue: false,
  trimValues: true,
  isArray: (name) => ["paragrahv", "loige", "punkt"].includes(name),
});

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function getText(node: unknown): string {
  if (!node || typeof node !== "object") return String(node ?? "").trim();
  const n = node as Record<string, unknown>;
  if (n["tavatekst"]) return String(n["tavatekst"]).trim();
  if (n["__cdata"]) return stripHtml(String(n["__cdata"]));
  return Object.values(n)
    .flatMap((v) => (Array.isArray(v) ? v.map(getText) : [getText(v)]))
    .join(" ")
    .trim();
}

// Parse seadused with proper <paragrahv> structure
function parseStructured(
  parsed: Record<string, unknown>,
  meta: ActMeta,
  dates: { effectiveFrom: string | null; lastAmended: string | null }
): ParsedChunk[] {
  const chunks: ParsedChunk[] = [];

  function walk(node: unknown): void {
    if (!node || typeof node !== "object") return;
    const n = node as Record<string, unknown>;

    if (Array.isArray(n["paragrahv"])) {
      for (const para of n["paragrahv"] as Record<string, unknown>[]) {
        const nr = para["paragrahvNr"] ? String(para["paragrahvNr"]) : "";
        const title = para["paragrahvPealkiri"] ? String(para["paragrahvPealkiri"]) : "";
        const loiged = (para["loige"] ?? []) as Record<string, unknown>[];

        const parts: string[] = [];
        if (title) parts.push(title);
        for (const l of loiged) {
          const lNr = l["loigeNr"] ? `(${l["loigeNr"]})` : "";
          const text = getText(l["sisuTekst"]);
          if (text) parts.push(`${lNr} ${text}`.trim());
        }

        const content = parts.join(" ").trim();
        if (!nr || content.length < 20) continue;

        chunks.push({
          act_id: meta.id,
          act_title: meta.title,
          act_type: meta.act_type,
          paragraph_nr: `§ ${nr}`,
          content_et: content,
          rt_identifier: meta.rt_identifier,
          ministry_owner: meta.ministry_owner,
          effective_from: dates.effectiveFrom,
          last_amended: dates.lastAmended,
          keywords: [],
        });
      }
    }

    for (const v of Object.values(n)) {
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === "object") walk(v);
    }
  }

  walk(parsed);
  return chunks;
}

// Parse simple määrused with HTMLKonteiner CDATA
function parseHtmlAct(
  xmlText: string,
  meta: ActMeta,
  dates: { effectiveFrom: string | null; lastAmended: string | null }
): ParsedChunk[] {
  const chunks: ParsedChunk[] = [];
  const cdataBlocks = [...xmlText.matchAll(/<!\[CDATA\[([\s\S]*?)\]\]>/g)].map((m) => m[1]);
  const html = cdataBlocks.join("\n");
  const sections = html.split(/(?=<[^>]*>\s*<b>\s*§\s*\d)/);

  for (const section of sections) {
    const nrMatch = section.match(/<b>[^§]*§\s*(\d+[a-z]?)\./i);
    if (!nrMatch) continue;
    const text = stripHtml(section);
    if (text.length < 20) continue;

    chunks.push({
      act_id: meta.id,
      act_title: meta.title,
      act_type: meta.act_type,
      paragraph_nr: `§ ${nrMatch[1]}`,
      content_et: text,
      rt_identifier: meta.rt_identifier,
      ministry_owner: meta.ministry_owner,
      effective_from: dates.effectiveFrom,
      last_amended: dates.lastAmended,
      keywords: [],
    });
  }

  return chunks;
}

function extractMeta(parsed: Record<string, unknown>): {
  effectiveFrom: string | null;
  lastAmended: string | null;
  keywords: string[];
} {
  const oigusakt = parsed?.["oigusakt"] as Record<string, unknown> | undefined;
  const m = oigusakt?.["metaandmed"] as Record<string, unknown> | undefined;
  if (!m) return { effectiveFrom: null, lastAmended: null, keywords: [] };

  // vastuvoetud.joustumine = entry into force date
  const vastuvoetud = m["vastuvoetud"] as Record<string, unknown> | undefined;
  const joustumine = vastuvoetud?.["joustumine"];
  const effectiveFrom = joustumine
    ? String(joustumine).split("+")[0].split("T")[0]
    : null;

  // kehtivus.kehtivuseAlgus = current version validity start
  const kehtivus = m["kehtivus"] as Record<string, unknown> | undefined;
  const kehtivuseAlgus = kehtivus?.["kehtivuseAlgus"];
  const lastAmended = kehtivuseAlgus
    ? String(kehtivuseAlgus).split("+")[0].split("T")[0]
    : null;

  // marksona = pre-tagged keywords (free gift from RT)
  const marksona = m["marksona"];
  const keywords = Array.isArray(marksona)
    ? marksona.map(String)
    : marksona
    ? [String(marksona)]
    : [];

  return { effectiveFrom, lastAmended, keywords };
}

async function fetchAndParse(act: ActMeta): Promise<ParsedChunk[]> {
  const res = await fetch(`${RT_BASE}/${act.id}.xml`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const xml = await res.text();
  const parsed = xmlParser.parse(xml) as Record<string, unknown>;
  const { effectiveFrom, lastAmended, keywords } = extractMeta(parsed);
  const dates = { effectiveFrom, lastAmended };

  const chunks = xml.includes("<paragrahv ")
    ? parseStructured(parsed, act, dates)
    : parseHtmlAct(xml, act, dates);

  // Stamp act-level keywords onto every chunk
  return chunks.map((c) => ({ ...c, keywords }));
}

// ─── Embedding ───────────────────────────────────────────────────────────────

async function embed(texts: string[]): Promise<number[][]> {
  if (!HF_TOKEN) {
    console.warn("  ⚠ HF_TOKEN missing — saving chunks without vectors");
    return texts.map(() => []);
  }
  const res = await fetch(
    "https://api-inference.huggingface.co/models/intfloat/multilingual-e5-large",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${HF_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ inputs: texts, options: { wait_for_model: true } }),
    }
  );
  if (!res.ok) throw new Error(`HuggingFace ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json() as Promise<number[][]>;
}

// ─── Upsert ───────────────────────────────────────────────────────────────────

async function upsert(chunks: ParsedChunk[], embeddings: number[][]): Promise<void> {
  const rows = chunks.map((c, i) => ({
    act_id: c.act_id,
    act_title: c.act_title,
    act_type: c.act_type,
    paragraph_nr: c.paragraph_nr,
    content_et: c.content_et,
    rt_identifier: c.rt_identifier,
    ministry_owner: c.ministry_owner,
    effective_from: c.effective_from,
    last_amended: c.last_amended,
    keywords: c.keywords,
    ...(embeddings[i]?.length ? { embedding: embeddings[i] } : {}),
  }));

  const { error } = await supabase
    .from("legal_chunks")
    .upsert(rows, { onConflict: "act_id,paragraph_nr" });
  if (error) throw new Error(error.message);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== RT ingest ===\n");

  for (const act of ACTS) {
    console.log(`▶ ${act.title} (${act.rt_identifier})`);

    let chunks: ParsedChunk[];
    try {
      chunks = await fetchAndParse(act);
    } catch (e) {
      console.error(`  ✗ ${e instanceof Error ? e.message : e}\n`);
      continue;
    }

    if (chunks.length === 0) {
      console.warn("  ⚠ 0 paragraphs — check XML format at riigiteataja.ee/akt/" + act.id + ".xml\n");
      continue;
    }

    console.log(`  ${chunks.length} paragraphs | sample: [${chunks[0].paragraph_nr}] ${chunks[0].content_et.slice(0, 70)}…`);

    let saved = 0;
    for (let i = 0; i < chunks.length; i += 8) {
      const batch = chunks.slice(i, i + 8);
      try {
        const vecs = await embed(batch.map((c) => c.content_et));
        await upsert(batch, vecs);
        saved += batch.length;
        process.stdout.write(".");
      } catch (e) {
        console.error(`\n  ✗ batch ${i}: ${e instanceof Error ? e.message : e}`);
      }
    }
    console.log(`\n  ✓ ${saved}/${chunks.length} saved\n`);
  }

  console.log("Done.");
}

main().catch((e) => { console.error(e); process.exit(1); });
