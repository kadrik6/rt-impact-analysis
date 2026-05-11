/**
 * Edge Function: analyse
 *
 * Default mode  → deterministlik analüüs (tasuta, kohe)
 * AI mode       → Claude Haiku/Sonnet, ainult käsitsi käivitades
 *
 * POST /functions/v1/analyse
 * Body: {
 *   draft: string,
 *   acts: [{id, title, lyhend}],
 *   mode?: "deterministic" | "ai"   // default: "deterministic"
 * }
 */

import { corsHeaders } from "../_shared/cors.ts";
import { parseActXml, extractActMeta } from "../_shared/parser.ts";
import {
  deterministicAnalysis,
  buildPossibleBodies,
  estimateTokens,
  estimateCostUsd,
  extractAmendedActNames,
} from "../_shared/deterministic.ts";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const HF_TOKEN           = Deno.env.get("HF_TOKEN") ?? "";
const GROQ_API_KEY       = Deno.env.get("GROQ_API_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const AI_ENABLED = Deno.env.get("AI_ENABLED") !== "false";
const AI_MAX_INPUT_CHARS = parseInt(Deno.env.get("AI_MAX_INPUT_CHARS") ?? "12000");
const AI_MODEL_CHEAP = Deno.env.get("AI_MODEL_CHEAP") ?? "claude-haiku-4-5-20251001";
const GROQ_MODEL = Deno.env.get("GROQ_MODEL") ?? "llama-3.3-70b-versatile";
const HF_EMBED_URL = "https://router.huggingface.co/hf-inference/models/sentence-transformers/paraphrase-multilingual-mpnet-base-v2/pipeline/feature-extraction";
const GROQ_BASE = "https://api.groq.com/openai/v1/chat/completions";
const PROMPT_VERSION = "v2";
const RT_BASE = "https://www.riigiteataja.ee/akt";

const MINISTRY_MAP: Record<string, string> = {
  TLS: "Sotsiaalministeerium", ÄS: "Justiitsministeerium", IKS: "Justiitsministeerium",
  ATS: "Rahandusministeerium", RHS: "Rahandusministeerium", KKS: "Kliimaministeerium",
  HTM: "Haridus- ja Teadusministeerium",
};

function guessMinistry(lyhend: string, title: string): string {
  if (MINISTRY_MAP[lyhend]) return MINISTRY_MAP[lyhend];
  const t = title.toLowerCase();
  if (t.includes("töölepingu") || t.includes("sotsiaalhoolekande")) return "Sotsiaalministeerium";
  if (t.includes("äriseadustik") || t.includes("andmekaitse")) return "Justiitsministeerium";
  if (t.includes("riigieelarve") || t.includes("maksukorraldus") || t.includes("hange")) return "Rahandusministeerium";
  if (t.includes("haridus") || t.includes("ülikool")) return "Haridus- ja Teadusministeerium";
  if (t.includes("ehitus") || t.includes("keskkond")) return "Kliimaministeerium";
  return "määramata";
}

async function fetchAndParseAct(id: string, title: string, lyhend: string) {
  const res = await fetch(`${RT_BASE}/${id}.xml`);
  if (!res.ok) throw new Error(`RT HTTP ${res.status} for act ${id}`);
  const xml = await res.text();
  const { rt_identifier } = extractActMeta(xml);
  const ministry = guessMinistry(lyhend, title);
  return parseActXml(xml, title, rt_identifier || `RT (${lyhend})`, ministry);
}

// SHA-256 hash using Web Crypto (available in Deno)
async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function checkCache(hash: string): Promise<Record<string, unknown> | null> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return null;
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/analysis_cache?input_hash=eq.${hash}&select=ai_result`,
      { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } }
    );
    if (!res.ok) return null;
    const rows = await res.json() as Array<{ ai_result: Record<string, unknown> }>;
    return rows[0]?.ai_result ?? null;
  } catch { return null; }
}

async function writeCache(hash: string, actIds: string[], draftPreview: string, model: string, result: unknown, inputTokens: number, outputTokens: number) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return;
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/analysis_cache`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "resolution=ignore-duplicates",
      },
      body: JSON.stringify({
        input_hash: hash,
        act_ids: actIds,
        draft_preview: draftPreview,
        model,
        prompt_version: PROMPT_VERSION,
        ai_result: result,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        estimated_cost_usd: estimateCostUsd(inputTokens, outputTokens, model),
      }),
    });
  } catch { /* non-critical */ }
}

// Strips standard Estonian legislative boilerplate sections from draft text.
// These sections (EU compliance, economic impact, author lists, entry-into-force)
// contain high-frequency legal vocabulary that has no domain-discriminating value.
function stripDraftBoilerplate(text: string): string {
  const SECTION_HEADERS = [
    "vastavus euroopa liidu",
    "eesti õiguse vastavus",
    "eelnõu ettevalmistajad",
    "seletuskirja koostajad",
    "ettevalmistajad:",
    "koostajad:",
    "majanduslik mõju",
    "mõju hindamine",
    "rahaline mõju",
    "eelarve mõju",
    "rakendamine ja jõustumine",
    "käesolev seadus jõustub üldises",
    "käesolevat seadust rakendatakse",
    "seadus jõustub päeval",
    "jõustub järgmisel päeval",
  ];

  // Split into paragraph blocks; remove any block whose first line matches a boilerplate header
  const blocks = text.split(/\n{2,}/);
  const cleaned = blocks.filter((block) => {
    const firstLine = block.trim().toLowerCase().slice(0, 80);
    return !SECTION_HEADERS.some((h) => firstLine.includes(h));
  });
  return cleaned.join("\n\n").trim();
}

function buildContext(chunks: ReturnType<typeof parseActXml>): string {
  return chunks
    .slice(0, 25)
    .map((c) => `[${c.rt_identifier} | ${c.act_title} | ${c.paragraph_nr}]\n${c.content_et}`)
    .join("\n\n---\n\n");
}

// Domain signal groups — used to detect the draft's scope and build exclusion rules
const DOMAIN_SIGNALS: Array<{ name: string; keywords: string[] }> = [
  { name: "hasartmängumaks", keywords: ["hasartmäng", "loterii", "kasiino", "kihlvedu", "hasartmängu"] },
  { name: "käibemaks", keywords: ["käibemaks", "käibemaksu"] },
  { name: "tulumaks", keywords: ["tulumaks", "tulumaksu"] },
  { name: "aktsiis", keywords: ["aktsiis", "aktsiisi"] },
  { name: "tööõigus", keywords: ["tööleping", "töölepingu", "töötaja", "töötajat"] },
  { name: "andmekaitse", keywords: ["isikuandmed", "andmekaitse", "gdpr"] },
  { name: "riigihanked", keywords: ["riigihange", "riigihanke"] },
  { name: "kriminaalmenetlus", keywords: ["kriminaal", "süütegu", "karistus", "vangistus"] },
  { name: "riigikaitse", keywords: ["kaitsevägi", "riigikaitse", "sõjavägi", "ajateenij"] },
  { name: "pension", keywords: ["pension", "vanaduspension", "pensioni"] },
  { name: "ehitus", keywords: ["ehitus", "ehitusluba", "planeerimis"] },
];

// Domains that are blocked by default unless the draft explicitly mentions them
const BLOCK_BY_DEFAULT = new Set(["kriminaalmenetlus", "riigikaitse", "pension"]);

// Estonian stopwords for specific-term extraction
const ESTONIAN_STOPWORDS = new Set([
  "seadus", "seaduse", "seadust", "seadustik", "eelnõu", "määrus", "määruse",
  "paragrahv", "lõige", "punkt", "muutmise", "rakendamise", "kehtestamise",
  "käesolev", "järgmine", "käesolevas", "vastavalt", "kohaselt", "samuti",
  "ning", "kuid", "aga", "või", "see", "need", "seda", "neid", "kes",
]);

function extractDraftContext(draft: string): {
  detectedDomains: string[];
  blockedDomains: string[];
  specificTerms: string[];
} {
  const lower = draft.toLowerCase();

  const detectedDomains = DOMAIN_SIGNALS
    .filter((d) => d.keywords.some((k) => lower.includes(k)))
    .map((d) => d.name);

  const blockedDomains = [...BLOCK_BY_DEFAULT].filter((d) => !detectedDomains.includes(d));

  // Specific terms: 5+ char words appearing ≥2 times, not stopwords
  const words = lower.match(/[a-züõöä]{5,}/g) ?? [];
  const freq = new Map<string, number>();
  for (const w of words) freq.set(w, (freq.get(w) ?? 0) + 1);
  const specificTerms = [...freq.entries()]
    .filter(([w, count]) => count >= 2 && !ESTONIAN_STOPWORDS.has(w))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([w]) => w);

  return { detectedDomains, blockedDomains, specificTerms };
}

function buildPrompt(draft: string, context: string): string {
  const { detectedDomains, blockedDomains, specificTerms } = extractDraftContext(draft);

  const domainLine = detectedDomains.length
    ? `Tuvastatud valdkond: ${detectedDomains.join(", ")}`
    : "Valdkond: täpsustamata — ole konservatiivne";

  const blockLine = blockedDomains.length
    ? `Blokeeritud valdkonnad (eira, kui eelnõu neile otseselt ei viita): ${blockedDomains.join(", ")}`
    : "Valdkondlikke piiranguid pole";

  const termsLine = specificTerms.length
    ? `Kõrge kaaluga spetsiifilised terminid: ${specificTerms.join(", ")}`
    : "";

  return `EELNÕU:
${draft.slice(0, AI_MAX_INPUT_CHARS)}

KONTEKST:
${domainLine}
${blockLine}
${termsLine}

RETRIEVED_CONTEXT:
${context}

Vasta AINULT kehtiva JSON-iga (ilma markdown-formaadita):
{
  "draft_focus": "ühe lausega: mis on eelnõu peamine eesmärk ja valdkond",
  "affected_acts": [
    {
      "category": "A",
      "act_title": "string",
      "rt_identifier": "string",
      "relevance_check": "üks lause: kuidas eelnõu KONKREETSELT muudab selle seaduse kohaldatavust",
      "reason": "üks lause kokkuvõte",
      "paragraphs": ["§ X"],
      "ministry": "string",
      "impact_type": "conflict | amendment_required | cross_reference | obsolete",
      "confidence": 0.0
    }
  ],
  "noise_acts": [
    {
      "act_title": "string",
      "reason_excluded": "miks on seos ainult terminoloogiline"
    }
  ],
  "conflicts_found": ["string"],
  "ministries_to_notify": ["string"],
  "unresolved": "string"
}

Kategooria A = eelnõu pealkiri või § viitab sellele aktile otseselt.
Kategooria B = valdkondlik kattuvus (reguleerib sama teemat).
Kategooria C = ainult terminoloogiline müra → lisa noise_acts hulka, MITTE affected_acts hulka.

Kõrge kaaluga terminid (${specificTerms.join(", ") || "pole"}) kattuvus on oluline.
Madala kaaluga terminid ("maks", "taotlus", "asutus", "menetlus") üksi EI põhjenda lisamist.`;
}

// ── Hybrid RAG helpers ────────────────────────────────────────────────────────

interface VectorChunk {
  act_id: string;
  act_title: string;
  paragraph_nr: string;
  content_et: string;
  ministry_owner: string;
  rt_identifier: string;
  domain: string | null;
  similarity: number;
}

async function embedText(text: string): Promise<number[] | null> {
  if (!HF_TOKEN) return null;
  const res = await fetch(HF_EMBED_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${HF_TOKEN}`,
      "Content-Type": "application/json",
    },
    // Single string input — HF returns float[] directly for single inputs
    body: JSON.stringify({ inputs: text.slice(0, 512), options: { wait_for_model: true } }),
  });
  if (!res.ok) return null;
  const data = await res.json() as number[];
  return Array.isArray(data) ? data : null;
}

async function fetchChunksByActTitle(actNameFragment: string): Promise<VectorChunk[]> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return [];
  const encoded = encodeURIComponent(`*${actNameFragment.toLowerCase()}*`);
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/legal_chunks?act_title=ilike.${encoded}&select=id,act_id,act_title,paragraph_nr,content_et,ministry_owner,rt_identifier,domain&limit=40`,
    { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } }
  );
  if (!res.ok) return [];
  const rows = await res.json() as Array<Omit<VectorChunk, "similarity">>;
  return rows.map((r) => ({ ...r, similarity: 1.0 }));
}

async function vectorSearch(embedding: number[], matchCount: number): Promise<VectorChunk[]> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return [];
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/match_legal_chunks`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
    // pgvector expects the vector as a bracketed string "[x,y,z,...]"
    body: JSON.stringify({
      query_embedding: `[${embedding.join(",")}]`,
      match_count: matchCount,
    }),
  });
  if (!res.ok) return [];
  return res.json() as Promise<VectorChunk[]>;
}

// ── Groq Agentic ─────────────────────────────────────────────────────────────

type GroqMessage =
  | { role: "system" | "user" | "assistant"; content: string | null; tool_calls?: GroqToolCall[] }
  | { role: "tool"; tool_call_id: string; name: string; content: string };

interface GroqToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

const AGENTIC_TOOLS = [
  {
    type: "function",
    function: {
      name: "get_law_details",
      description: "Pärib andmebaasist konkreetse seaduse paragrahvi täpse ja kehtiva sõnastuse. Kasuta seda kui RAG-ist saadud lõik on liiga lühike, kärpitud (lõpeb …) või vajad kinnitust konkreetse sätte kohta.",
      parameters: {
        type: "object",
        properties: {
          law_name: {
            type: "string",
            description: "Seaduse lühend, nimi või osa nimest (nt 'HasMMS', 'Hasartmängumaksu seadus', 'töölepingu seadus')",
          },
          paragraph: {
            type: "string",
            description: "Paragrahvi number (nt '7', '12a', '15 lõige 3')",
          },
        },
        required: ["law_name", "paragraph"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "report_findings",
      description: "Esita analüüsi lõpptulemus. Kutsu seda tööriista alati kui oled seosed tuvastanud ja analüüs on valmis. See on ainus viis tulemuse esitamiseks.",
      parameters: {
        type: "object",
        properties: {
          affected_acts: {
            type: "array",
            description: "Kõik tuvastatud mõjutatud seadused",
            items: {
              type: "object",
              properties: {
                act_title:       { type: "string", description: "Seaduse täisnimi" },
                rt_identifier:   { type: "string", description: "Riigi Teataja identifikaator" },
                reason:          { type: "string", description: "1-2 lauseline põhjendus eesti keeles, miks see seadus on mõjutatud" },
                confidence:      { type: "number", description: "Kindlustase vahemikus 0.0-1.0" },
                category:        { type: "string", enum: ["A", "B"], description: "A = otseselt muudetav, B = kaudne mõju" },
                directly_amended:{ type: "boolean", description: "true kui eelnõu muudab seda seadust otseselt" },
                paragraphs:      { type: "array", items: { type: "string" }, description: "Asjakohased paragrahvid" },
                impact_type:     { type: "string", enum: ["conflict", "amendment_required", "cross_reference", "obsolete"] },
                keyword_hits:    { type: "array", items: { type: "string" }, description: "Olulisemad ühised märksõnad" },
              },
              required: ["act_title", "rt_identifier", "reason", "confidence", "category", "impact_type"],
            },
          },
          conflicts_found: {
            type: "array",
            items: { type: "string" },
            description: "Otsesed konfliktid kehtiva õigusega",
          },
          unresolved: {
            type: "string",
            description: "Lahendamata küsimused või tühi string kui kõik on selge",
          },
        },
        required: ["affected_acts", "conflicts_found", "unresolved"],
      },
    },
  },
];

async function executeTool_getLawDetails(lawName: string, paragraph: string): Promise<string> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return "Andmebaas ei ole saadaval.";

  // Normalize paragraph: strip § and leading zeros for flexible matching
  const paraKey = paragraph.replace(/§\s*/g, "").trim();

  const encodedAct = encodeURIComponent(`*${lawName.toLowerCase()}*`);
  const encodedPara = encodeURIComponent(`*${paraKey}*`);

  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/legal_chunks?act_title=ilike.${encodedAct}&paragraph_nr=ilike.${encodedPara}&select=act_title,paragraph_nr,content_et&limit=4`,
    { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } }
  );

  if (!res.ok) return `Päring ebaõnnestus (${res.status}).`;
  const rows = await res.json() as Array<{ act_title: string; paragraph_nr: string; content_et: string }>;
  if (rows.length === 0) return `Ei leitud: "${lawName}" ${paragraph}. Kontrolli seaduse nime või paragrahvi numbrit.`;

  return rows.map((r) => `**${r.act_title} — ${r.paragraph_nr}**\n${r.content_et}`).join("\n\n---\n\n");
}

interface ReportFindingsArgs {
  affected_acts: Array<{
    act_title: string;
    rt_identifier: string;
    reason: string;
    confidence: number;
    category: "A" | "B";
    directly_amended?: boolean;
    paragraphs?: string[];
    impact_type: string;
    keyword_hits?: string[];
  }>;
  conflicts_found: string[];
  unresolved: string;
}

async function runAgenticLoop(
  messages: GroqMessage[],
  maxIterations = 7
): Promise<{ findings: ReportFindingsArgs; toolCallsMade: number }> {
  let toolCallsMade = 0;

  for (let i = 0; i < maxIterations; i++) {
    const res = await fetch(GROQ_BASE, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages,
        tools: AGENTIC_TOOLS,
        // "required" forces Groq to always use a tool — prevents plain-text drift
        tool_choice: "required",
        temperature: 0.1,
        max_tokens: 3000,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Groq API viga ${res.status}: ${err.slice(0, 200)}`);
    }

    const data = await res.json() as {
      choices: Array<{
        message: { role: string; content: string | null; tool_calls?: GroqToolCall[] };
        finish_reason: string;
      }>;
    };

    const msg = data.choices[0].message;
    messages.push({ role: "assistant", content: msg.content ?? null, tool_calls: msg.tool_calls });

    if (!msg.tool_calls || msg.tool_calls.length === 0) {
      // tool_choice: "required" means this shouldn't happen, but handle gracefully
      throw new Error("Groq ei kasutanud tööriista vaatamata tool_choice: required seadistusele.");
    }

    for (const tc of msg.tool_calls) {
      // report_findings = final answer delivered via tool call
      if (tc.function.name === "report_findings") {
        const findings = JSON.parse(tc.function.arguments) as ReportFindingsArgs;
        return { findings, toolCallsMade };
      }

      // get_law_details = data lookup, continue loop
      toolCallsMade++;
      let result: string;
      try {
        const args = JSON.parse(tc.function.arguments) as { law_name: string; paragraph: string };
        result = await executeTool_getLawDetails(args.law_name, args.paragraph);
      } catch (e) {
        result = `Viga tööriista täitmisel: ${e}`;
      }
      messages.push({ role: "tool", tool_call_id: tc.id, name: tc.function.name, content: result });
    }
  }

  throw new Error("Maksimaalne iteratsioonide arv ületatud ilma lõpptulemuseta.");
}

async function generateImpactReport(
  draftTitle: string,
  draftText: string,
  affectedActs: Array<{
    act_title: string;
    rt_identifier: string;
    reason: string;
    paragraphs?: string[];
    impact_type?: string;
    directly_amended?: boolean;
  }>
): Promise<string> {
  const actsBlock = affectedActs.map((a) => {
    const paras = a.paragraphs?.length ? ` (${a.paragraphs.join(", ")})` : "";
    const tag = a.directly_amended ? " [otseselt muudetav]" : "";
    return `- ${a.act_title}${paras}${tag}: ${a.reason}`;
  }).join("\n");

  const systemPrompt = `Oled Eesti õigusloomega tegelev jurist. Kirjuta eelnõu seletuskirja peatükk "Mõjude analüüs" ametlikus ja lakoonilises juriidilises keeles.

Struktuur peab olema täpselt järgmine (kasuta Markdowni):

## Mõjude analüüs

### 1. Mõju õiguskorrale
(Kuidas eelnõu mõjutab kehtivat õigust — milliseid seadusi muudetakse, milliseid tuleb koos lugeda)

### 2. Mõju riigieelarvele
(Hinnang tulude/kulude muutusele; kui pole mõju, märgi "Eelnõul puudub otsene mõju riigieelarve tuludele ja kuludele.")

### 3. Halduskoormus
(Millistel asutustel tekib lisakoormus; kui puudub, märgi sõnaselgelt)

### 4. Mõju sihtrühmadele
(Kes on otseselt mõjutatud: ettevõtjad, isikud, asutused)

### 5. Kokkuvõte
(2–3 lauset: miks muudatus on vajalik ja proportsionaalne)

Reeglid:
- Ainult eesti keel
- Ära viita tundmatutele paragrahvidele — kasuta ainult antud infot
- Ära lisa selgitusi ega kommentaare väljaspool struktuuri`;

  const userMessage = `EELNÕU PEALKIRI: ${draftTitle || "(puudub)"}

EELNÕU TEKST (väljavõte):
${draftText.slice(0, 2500)}

ANALÜÜSI LEITUD SEOSED:
${actsBlock || "Ühtegi olulist seost ei tuvastatud."}

Koosta selle põhjal ametlik mõjuanalüüsi peatükk.`;

  const res = await fetch(GROQ_BASE, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${GROQ_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      temperature: 0.2,
      max_tokens: 2000,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Groq API viga ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = await res.json() as {
    choices: Array<{ message: { content: string } }>;
  };
  return data.choices[0]?.message?.content ?? "";
}

// ── Claude ────────────────────────────────────────────────────────────────────

async function callClaude(systemPrompt: string, userPrompt: string, model: string): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Claude API ${res.status}: ${err.slice(0, 200)}`);
  }
  const data = await res.json() as {
    content: Array<{ type: string; text: string }>;
    usage: { input_tokens: number; output_tokens: number };
  };
  return {
    text: data.content[0]?.text ?? "{}",
    inputTokens: data.usage?.input_tokens ?? 0,
    outputTokens: data.usage?.output_tokens ?? 0,
  };
}

const SYSTEM_PROMPT = `Oled kogenud Eesti õigusnõunik. Sinu ülesanne on leida eelnõu ja kehtivate seaduste vahelisi sisulisi vastuolusid või vajalikke muudatusi.

RANGELT KINNIPEETAVAD REEGLID:

1. SISULISUS — Rapora ainult aktid, kus muudatus otseselt mõjutab teise seaduse kohaldatavust, finantskohustusi, õigussubjektide ringi või õigusselgust. Terminoloogiline kattuvus (mõlemad tekstid sisaldavad sõna "taotlus", "asutus", "tähtaeg", "peab", "maks" vms) EI ole piisav alus.

2. DOMEENILOOGIKA — Tuvasta esmalt eelnõu valdkond. Aktid täiesti erinevatest valdkondadest (nt riigikaitse, intellektuaalomand, maaõigus) ei kuulu tulemusesse, välja arvatud juhul, kui suudad selgitada konkreetset mehhanismi, kuidas eelnõu neid sisuliselt mõjutab — mitte lihtsalt et mõlemad tekstid mainivad "maksu" või "palka".

3. NEGATIIVSED PIIRANGUD — Ära kuva vasteid, mis põhinevad ainult protseduurilistel kattumustel (haldusmenetluse sätted, menetlustähtajad, kohtumenetluse reeglid). Need on "seotud" mis tahes eelnõuga terminoloogiliselt, kuid selline seos ei ole juriidiliselt oluline.

4. SELGITUSKOHUSTUS — Iga leitud seose puhul selgita ühes konkreetses lauses, kuidas eelnõu muudab selle seaduse rakendatavust, rahalist kohustust või loob uue regulatiivse konflikti — mitte lihtsalt et mõlemad tekstid puudutavad sarnaseid teemasid.

5. MAHT — Maksimaalselt 6 akti affected_acts hulgas. Eelistusele läheb kvaliteet kogusele. confidence < 0.7 → lisa unresolved sektsiooni.

6. TEHNILINE — Kasuta ainult paragrahve ja RT identifikaatoreid, mis esinevad RETRIEVED_CONTEXT osas. Ära leiuta identifikaatoreid. Väljund: ainult kehtiv JSON, ilma markdown-formaadita.`;


Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

  try {
    const body = await req.json() as {
      draft: string;
      title?: string;
      acts: Array<{ id: string; title: string; lyhend: string }>;
      mode?: "deterministic" | "ai" | "hybrid" | "agentic" | "impact_report";
    };

    const { draft, title: draftTitle = "", acts, mode = "deterministic" } = body;

    // Hybrid mode: vector search from DB — acts[] not required
    if (mode === "hybrid") {
      if (!HF_TOKEN) {
        return new Response(JSON.stringify({ error: "HF_TOKEN ei ole seadistatud" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const cleanDraft = stripDraftBoilerplate(draft);
      const embedding = await embedText(cleanDraft);
      if (!embedding) {
        return new Response(JSON.stringify({ error: "Teksti vektoreerimine ebaõnnestus" }), {
          status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const vectorChunks = await vectorSearch(embedding, 60);
      if (vectorChunks.length === 0) {
        return new Response(JSON.stringify({
          error: "Vektoribaas on tühi. Käivita kõigepealt: deno run scripts/ingest-chunks.ts && scripts/embed-chunks.ts",
        }), { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Parse draft title to find directly-amended acts (e.g. "Hasartmängumaksu seaduse muutmine")
      const directlyAmendedNames = extractAmendedActNames(draftTitle);
      const existingTitles = new Set(vectorChunks.map((c) => c.act_title.toLowerCase()));

      // Fetch chunks for directly-amended acts that vector search may have missed
      const extraChunks: VectorChunk[] = [];
      for (const name of directlyAmendedNames) {
        const key = name.split(" ")[0].toLowerCase(); // first word is the most unique part
        const alreadyPresent = [...existingTitles].some((t) => t.includes(key));
        if (!alreadyPresent) {
          const fetched = await fetchChunksByActTitle(key);
          extraChunks.push(...fetched);
        }
      }

      const allChunks = [...vectorChunks, ...extraChunks];

      // Map to the Chunk interface deterministicAnalysis expects
      const hybridChunks = allChunks.map((c) => ({
        paragraph_nr: c.paragraph_nr,
        content_et: c.content_et,
        act_title: c.act_title,
        rt_identifier: c.rt_identifier,
        ministry_owner: c.ministry_owner,
      }));

      const detResults = deterministicAnalysis(hybridChunks, cleanDraft);

      // Elevate directly-amended acts: confidence 1.0, category A, directly_amended flag
      const directKeys = directlyAmendedNames.map((n) => n.split(" ")[0].toLowerCase());
      for (const act of detResults) {
        const titleLower = act.act_title.toLowerCase();
        if (directKeys.some((k) => titleLower.includes(k))) {
          act.directly_amended = true;
          act.category = "A";
          act.confidence = 1.0;
          if (!act.reason.startsWith("Otseselt muudetav")) {
            act.reason = `Otseselt muudetav akt (eelnõu pealkiri). ${act.reason}`;
          }
        }
      }

      // Directly-amended acts sort first, then by risk_score descending
      detResults.sort((a, b) => {
        if (a.directly_amended && !b.directly_amended) return -1;
        if (!a.directly_amended && b.directly_amended) return 1;
        return b.risk_score - a.risk_score;
      });

      const possibleBodies = buildPossibleBodies(detResults);

      // Build act_id lookup for RT URLs (from all retrieved chunks)
      const actIdMap = new Map<string, string>(
        allChunks.map((c) => [c.act_title, c.act_id])
      );

      return new Response(JSON.stringify({
        mode: "hybrid",
        affected_acts: detResults.map((a) => ({
          act_title: a.act_title,
          rt_identifier: a.rt_identifier,
          reason: a.reason,
          category: a.category,
          directly_amended: a.directly_amended ?? false,
          paragraphs: a.paragraphs,
          ministry: a.ministry,
          ministryHints: a.ministryHints,
          impact_type: a.impact_type,
          confidence: a.confidence,
          keyword_hits: a.keyword_hits,
          risk_score: a.risk_score,
          rt_url: `${RT_BASE}/${actIdMap.get(a.act_title) ?? ""}`,
          confirmed: null,
        })),
        conflicts_found: detResults.filter((a) => a.impact_type === "conflict").map((a) => `${a.act_title}: ${a.reason}`),
        ministries_to_notify: [...new Set(detResults.map((a) => a.ministry).filter(Boolean))],
        possible_bodies: possibleBodies,
        unresolved: detResults.length === 0 ? "Semantiline otsing ei tuvastanud olulisi seoseid." : "",
        generated_at: new Date().toISOString(),
        acts_analysed: [...new Set(allChunks.map((c) => c.act_title))],
        paragraphs_retrieved: allChunks.length,
        ai_available: !!ANTHROPIC_API_KEY,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Agentic mode: hybrid RAG → Groq Llama 3 with tool calling
    if (mode === "agentic") {
      if (!GROQ_API_KEY) {
        return new Response(JSON.stringify({ error: "GROQ_API_KEY ei ole seadistatud. Hangi tasuta võti: console.groq.com" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const cleanDraft = stripDraftBoilerplate(draft);

      // Step 1: Hybrid RAG — same as hybrid mode
      const embedding = HF_TOKEN ? await embedText(cleanDraft) : null;
      let candidateChunks: VectorChunk[] = embedding ? await vectorSearch(embedding, 50) : [];

      // Ensure directly-amended acts are in the pool
      if (draftTitle) {
        const directNames = extractAmendedActNames(draftTitle);
        const existingTitles = new Set(candidateChunks.map((c) => c.act_title.toLowerCase()));
        for (const name of directNames) {
          const key = name.split(" ")[0].toLowerCase();
          if (![...existingTitles].some((t) => t.includes(key))) {
            const extra = await fetchChunksByActTitle(key);
            candidateChunks.push(...extra);
          }
        }
      }

      if (candidateChunks.length === 0) {
        return new Response(JSON.stringify({
          error: "Vektoribaas on tühi. Käivita kõigepealt ingest + embed skriptid.",
        }), { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Step 2: Deterministic pre-ranking — top 6 acts for Groq context
      const hybridChunks = candidateChunks.map((c) => ({
        paragraph_nr: c.paragraph_nr,
        content_et: c.content_et,
        act_title: c.act_title,
        rt_identifier: c.rt_identifier,
        ministry_owner: c.ministry_owner,
      }));
      const detResults = deterministicAnalysis(hybridChunks, cleanDraft);
      const topActs = detResults.slice(0, 6);

      // Step 3: Build context block for Groq
      const contextBlock = topActs.map((act, i) => {
        const chunks = candidateChunks
          .filter((c) => c.act_title === act.act_title)
          .slice(0, 3);
        const chunkTexts = chunks
          .map((c) => `  ${c.paragraph_nr}: ${c.content_et.slice(0, 450)}${c.content_et.length > 450 ? "…" : ""}`)
          .join("\n");
        return `${i + 1}. **${act.act_title}** (${act.rt_identifier})\n${chunkTexts}`;
      }).join("\n\n");

      const agenticSystemPrompt = `Oled kogenud Eesti õigusnõunik. Sinu ülesanne on analüüsida eelnõu mõju kehtivatele seadustele.

Sul on kaks tööriista:
1. get_law_details — kasuta seda KUI RAG-ist saadud lõik on kärpitud (lõpeb "…") või vajad kinnitust konkreetse sätte kohta. Maksimaalselt 3 korda.
2. report_findings — kasuta seda analüüsi lõpptulemuseks esitamiseks. See on AINUS viis vastuse andmiseks. Ära kirjuta vastust vabas tekstis.

Töövoog: analüüsi → vajadusel get_law_details → report_findings.`;

      const agenticUserPrompt = `EELNÕU PEALKIRI: ${draftTitle || "(puudub)"}

EELNÕU TEKST:
${cleanDraft.slice(0, 3000)}

RAG-I LEITUD KANDIDAATSEADUSED (top ${topActs.length}):
${contextBlock}

Analüüsi, kas ja kuidas eelnõu neid seadusi mõjutab. Kasuta get_law_details tööriista kui mõni lõik on liiga lühike.`;

      // Step 4: Agentic loop
      const messages: GroqMessage[] = [
        { role: "system", content: agenticSystemPrompt },
        { role: "user", content: agenticUserPrompt },
      ];

      // Step 4: Agentic loop — report_findings tool call is the structured answer
      const { findings, toolCallsMade } = await runAgenticLoop(messages);

      const actIdMap = new Map<string, string>(candidateChunks.map((c) => [c.act_title, c.act_id]));
      const detMap = new Map(detResults.map((d) => [d.act_title, d]));

      const affectedActs = (findings.affected_acts ?? []).map((a) => {
        const det = detMap.get(a.act_title);
        return {
          act_title: a.act_title,
          rt_identifier: a.rt_identifier,
          reason: a.reason,
          category: a.category ?? "B",
          directly_amended: a.directly_amended ?? false,
          paragraphs: a.paragraphs ?? [],
          ministry: det?.ministry ?? "määramata",
          ministryHints: det?.ministryHints ?? [],
          impact_type: a.impact_type ?? "amendment_required",
          confidence: a.confidence ?? 0.7,
          keyword_hits: a.keyword_hits ?? [],
          risk_score: det?.risk_score ?? 0,
          rt_url: `${RT_BASE}/${actIdMap.get(a.act_title) ?? ""}`,
          confirmed: null,
        };
      });

      return new Response(JSON.stringify({
        mode: "agentic",
        affected_acts: affectedActs,
        conflicts_found: findings.conflicts_found ?? [],
        ministries_to_notify: [...new Set(affectedActs.map((a) => a.ministry).filter(Boolean))],
        possible_bodies: buildPossibleBodies(detResults),
        unresolved: findings.unresolved ?? "",
        generated_at: new Date().toISOString(),
        acts_analysed: [...new Set(candidateChunks.map((c) => c.act_title))],
        paragraphs_retrieved: candidateChunks.length,
        tool_calls_made: toolCallsMade,
        ai_available: !!ANTHROPIC_API_KEY,
        model_used: GROQ_MODEL,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Impact report mode: generate seletuskiri chapter from analysis results
    if (mode === "impact_report") {
      if (!GROQ_API_KEY) {
        return new Response(JSON.stringify({ error: "GROQ_API_KEY ei ole seadistatud" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const affectedActs = (body as unknown as {
        affected_acts?: Array<{
          act_title: string; rt_identifier: string; reason: string;
          paragraphs?: string[]; impact_type?: string; directly_amended?: boolean;
        }>;
      }).affected_acts ?? [];

      const report = await generateImpactReport(draftTitle, draft, affectedActs);
      return new Response(JSON.stringify({ mode: "impact_report", report, generated_at: new Date().toISOString() }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!draft || !acts?.length) {
      return new Response(JSON.stringify({ error: "draft and acts[] required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- Strip boilerplate from draft before any scoring ---
    const cleanDraft = stripDraftBoilerplate(draft);

    // --- Fetch and parse acts (always needed) ---
    const chunkArrays = await Promise.all(
      acts.map((a) => fetchAndParseAct(a.id, a.title, a.lyhend))
    );
    const allChunks = chunkArrays.flat();

    if (allChunks.length === 0) {
      return new Response(JSON.stringify({ error: "No paragraphs could be parsed from selected acts" }), {
        status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- Deterministic analysis uses ALL chunks (grouped by act internally) ---
    // Do NOT pre-filter here — deterministicAnalysis does per-act token union scoring
    // which requires seeing every chunk of every selected act.
    const detResults = deterministicAnalysis(allChunks, cleanDraft);

    // --- For AI context: take top 25 most-overlapping chunks (token budget) ---
    const draftTokens = new Set(cleanDraft.toLowerCase().match(/[a-züõöä]{4,}/g) ?? []);
    const scored = allChunks.map((c) => {
      const words = c.content_et.toLowerCase().match(/[a-züõöä]{4,}/g) ?? [];
      const overlap = words.filter((w) => draftTokens.has(w)).length;
      return { chunk: c, score: overlap };
    });
    scored.sort((a, b) => b.score - a.score);
    const relevant = scored.slice(0, 25).map((s) => s.chunk);

    const context = buildContext(relevant);
    const userPrompt = buildPrompt(draft, context);
    const promptPreview = `SYSTEM:\n${SYSTEM_PROMPT}\n\nUSER:\n${userPrompt}`;
    const estimatedInputTokens = estimateTokens(SYSTEM_PROMPT + userPrompt);
    const estimatedCost = estimateCostUsd(estimatedInputTokens, 500, AI_MODEL_CHEAP);

    // --- Deterministic mode: return without calling Claude ---
    if (mode === "deterministic" || !AI_ENABLED || !ANTHROPIC_API_KEY) {
      const detMinistriesToNotify = [...new Set(detResults.map((a) => a.ministry).filter(Boolean))];
      const detConflicts = detResults
        .filter((a) => a.impact_type === "conflict")
        .map((a) => `${a.act_title}: ${a.reason}`);
      const possibleBodies = buildPossibleBodies(detResults);

      return new Response(JSON.stringify({
        mode: "deterministic",
        affected_acts: detResults.map((a) => ({
          act_title: a.act_title,
          rt_identifier: a.rt_identifier,
          reason: a.reason,
          category: a.category,
          paragraphs: a.paragraphs,
          ministry: a.ministry,
          ministryHints: a.ministryHints,
          impact_type: a.impact_type,
          confidence: a.confidence,
          keyword_hits: a.keyword_hits,
          risk_score: a.risk_score,
          rt_url: `https://www.riigiteataja.ee/akt/${acts.find((a2) => a2.title === a.act_title)?.id ?? ""}`,
          confirmed: null,
        })),
        conflicts_found: detConflicts,
        ministries_to_notify: detMinistriesToNotify,
        possible_bodies: possibleBodies,
        unresolved: detResults.length === 0 ? "Deterministlik analüüs ei tuvastanud olulisi kattuvusi. Täienda AI-ga täpsema tulemuse saamiseks." : "",
        generated_at: new Date().toISOString(),
        acts_analysed: acts.map((a) => a.title),
        paragraphs_retrieved: relevant.length,
        prompt_preview: promptPreview,
        estimated_input_tokens: estimatedInputTokens,
        estimated_cost_usd: estimatedCost,
        ai_available: !!ANTHROPIC_API_KEY && AI_ENABLED,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // --- AI mode: check cache first ---
    const actIds = acts.map((a) => a.id).sort();
    const cacheKey = await sha256(actIds.join(",") + draft.slice(0, 500) + PROMPT_VERSION + AI_MODEL_CHEAP);
    const cached = await checkCache(cacheKey);

    if (cached) {
      return new Response(JSON.stringify({
        ...cached,
        mode: "ai",
        from_cache: true,
        generated_at: new Date().toISOString(),
        acts_analysed: acts.map((a) => a.title),
        paragraphs_retrieved: relevant.length,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // --- AI mode: call Claude ---
    const { text: raw, inputTokens, outputTokens } = await callClaude(SYSTEM_PROMPT, userPrompt, AI_MODEL_CHEAP);

    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in Claude response");
    const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;

    const result = {
      ...parsed,
      mode: "ai",
      from_cache: false,
      generated_at: new Date().toISOString(),
      acts_analysed: acts.map((a) => a.title),
      paragraphs_retrieved: relevant.length,
      model_used: AI_MODEL_CHEAP,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      estimated_cost_usd: estimateCostUsd(inputTokens, outputTokens, AI_MODEL_CHEAP),
      affected_acts: ((parsed.affected_acts ?? []) as Array<Record<string, unknown>>).map((act) => ({
        ...act,
        rt_url: `https://www.riigiteataja.ee/akt/${acts.find((a) => a.title === act["act_title"])?.id ?? ""}`,
        confirmed: null,
      })),
    };

    // Cache in background
    writeCache(cacheKey, actIds, draft.slice(0, 500), AI_MODEL_CHEAP, result, inputTokens, outputTokens);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
