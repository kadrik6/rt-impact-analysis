/**
 * Edge Function: guide
 * Accepts a natural-language description of a draft law and returns
 * Claude-powered act suggestions with reasoning.
 * POST { description: string }
 */

import { corsHeaders } from "../_shared/cors.ts";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const RT_BASE = "https://www.riigiteataja.ee";

interface Act {
  id: string;
  title: string;
  lyhend: string;
  ministry: string;
}

interface Suggestion {
  id: string;
  title: string;
  lyhend: string;
  ministry: string;
  reason: string;
  urgency: "kindlasti" | "tõenäoliselt" | "kaaluda";
}

async function fetchCatalog(): Promise<Act[]> {
  const res = await fetch(`${RT_BASE}/lyhendid.html`, {
    headers: { "Accept-Language": "et-EE,et;q=0.9", "User-Agent": "Mozilla/5.0" },
  });
  if (!res.ok) throw new Error(`RT ${res.status}`);
  const html = await res.text();

  const tbodyMatch = html.match(/<tbody>([\s\S]*?)<\/tbody>/i);
  if (!tbodyMatch) return [];

  const acts: Act[] = [];
  const rowRegex = /<tr[\s\S]*?<\/tr>/gi;
  let row: RegExpExecArray | null;

  while ((row = rowRegex.exec(tbodyMatch[1])) !== null) {
    const idMatch = row[0].match(/href="[^"]*\/akt\/(\d{6,})"[^>]*>([^<]+)<\/a>/);
    const lyhendMatch = row[0].match(/href="[^"]*\/akt\/([A-ZÜÕÖÄ][A-ZÜÕÖÄa-züõöä0-9\-]{1,20})"[^>]*>([^<]+)<\/a>/);
    if (!idMatch) continue;
    acts.push({
      id: idMatch[1],
      title: idMatch[2].trim(),
      lyhend: lyhendMatch ? lyhendMatch[2].trim() : "",
      ministry: guessMinistry(idMatch[2], lyhendMatch ? lyhendMatch[2] : ""),
    });
  }
  return acts;
}

function guessMinistry(title: string, lyhend: string): string {
  const t = title.toLowerCase();
  const LYHEND_MAP: Record<string, string> = {
    TLS: "Sotsiaalministeerium", SHS: "Sotsiaalministeerium", PKS: "Sotsiaalministeerium",
    ÄS: "Justiitsministeerium", IKS: "Justiitsministeerium", AvTS: "Justiitsministeerium",
    ATS: "Rahandusministeerium", RHS: "Rahandusministeerium", MKS: "Rahandusministeerium",
    KKS: "Kliimaministeerium", EhS: "Kliimaministeerium", PlanS: "Kliimaministeerium",
  };
  if (LYHEND_MAP[lyhend]) return LYHEND_MAP[lyhend];
  if (t.includes("töölepingu") || t.includes("sotsiaalhoolekande") || t.includes("pension") || t.includes("ravikindlustus")) return "Sotsiaalministeerium";
  if (t.includes("äriseadustik") || t.includes("andmekaitse") || t.includes("kohtutäitur") || t.includes("karistus")) return "Justiitsministeerium";
  if (t.includes("riigieelarve") || t.includes("maksukorraldus") || t.includes("hange") || t.includes("maksu") || t.includes("aktsiisi")) return "Rahandusministeerium";
  if (t.includes("haridus") || t.includes("ülikool") || t.includes("kutseõppe")) return "Haridus- ja Teadusministeerium";
  if (t.includes("ehitus") || t.includes("keskkond") || t.includes("jäätme") || t.includes("kliima")) return "Kliimaministeerium";
  if (t.includes("politsei") || t.includes("kohalik omavalitsus") || t.includes("välismaalaste")) return "Siseministeerium";
  if (t.includes("põllumajandus") || t.includes("metsaseadus") || t.includes("toiduseadus")) return "Regionaal- ja Põllumajandusministeerium";
  if (t.includes("kultuur") || t.includes("sport") || t.includes("ringhääling")) return "Kultuuriministeerium";
  if (t.includes("side") || t.includes("transport") || t.includes("energia") || t.includes("elektri")) return "Majandus- ja Kommunikatsiooniministeerium";
  if (t.includes("kaitseväe") || t.includes("riigikaitse")) return "Kaitseministeerium";
  return "Muu";
}

function buildCatalogText(acts: Act[]): string {
  return acts
    .map((a) => `${a.id}|${a.lyhend || "-"}|${a.title}|${a.ministry}`)
    .join("\n");
}

async function askClaude(description: string, catalogText: string): Promise<Suggestion[]> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: `Sa oled Eesti seadusandliku mõjuanalüüsi ekspert.
Sinu ülesanne on kasutaja kirjelduse põhjal valida aktide kataloogist need seadused,
millega uus eelnõu tõenäoliselt kokku puutub.

Tagasta AINULT JSON-massiiv, ilma selgitusteta väljaspool JSON-i.
Vali 4–8 akti. Ole konkreetne — ära vali kõike, mis kaudselt seotud.`,
      messages: [{
        role: "user",
        content: `EELNÕU KIRJELDUS:
${description}

AKTIDE KATALOOG (id|lühend|pealkiri|ministeerium):
${catalogText}

Tagasta JSON:
[
  {
    "id": "aktId",
    "lyhend": "lühend",
    "title": "pealkiri",
    "ministry": "ministeerium",
    "reason": "Üks lause miks see akt on mõjutatud",
    "urgency": "kindlasti" | "tõenäoliselt" | "kaaluda"
  }
]`,
      }],
    }),
  });

  if (!res.ok) throw new Error(`Claude ${res.status}`);
  const data = await res.json() as { content: Array<{ type: string; text: string }> };
  const raw = data.content[0]?.text ?? "[]";
  const match = raw.match(/\[[\s\S]*\]/);
  if (!match) return [];
  return JSON.parse(match[0]) as Suggestion[];
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

  try {
    const { description } = await req.json() as { description: string };

    if (!description?.trim()) {
      return new Response(JSON.stringify({ error: "description required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const acts = await fetchCatalog();
    const catalogText = buildCatalogText(acts);
    const suggestions = await askClaude(description, catalogText);

    return new Response(JSON.stringify({ suggestions }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
