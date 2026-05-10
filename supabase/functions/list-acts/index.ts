/**
 * Edge Function: list-acts
 * Fetches the RT abbreviations page and returns a searchable act catalog.
 * GET /functions/v1/list-acts?q=tööleping&limit=20&ministry=Sotsiaalministeerium
 */

import { corsHeaders } from "../_shared/cors.ts";

interface Act {
  id: string;
  title: string;
  lyhend: string;
  rt_url: string;
  ministry: string;
}

let cachedActs: Act[] | null = null;
let cacheTime = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

function guessMinistry(title: string, lyhend: string): string {
  const t = title.toLowerCase();
  const l = lyhend.toUpperCase();

  const LYHEND_MAP: Record<string, string> = {
    TLS: "Sotsiaalministeerium", TTOS: "Sotsiaalministeerium", TTTS: "Sotsiaalministeerium",
    SHS: "Sotsiaalministeerium", RaKS: "Sotsiaalministeerium", PKS: "Sotsiaalministeerium",
    ÄS: "Justiitsministeerium", AvTS: "Justiitsministeerium", IKS: "Justiitsministeerium",
    ATS: "Rahandusministeerium", RHS: "Rahandusministeerium", MKS: "Rahandusministeerium",
    MSOS: "Rahandusministeerium", RES: "Rahandusministeerium",
    HTM: "Haridus- ja Teadusministeerium", HaS: "Haridus- ja Teadusministeerium",
    ÜKS: "Haridus- ja Teadusministeerium",
    KKS: "Kliimaministeerium", EhS: "Kliimaministeerium", PlanS: "Kliimaministeerium",
    LKS: "Kliimaministeerium",
    MaaRS: "Regionaal- ja Põllumajandusministeerium",
    MÕKS: "Regionaal- ja Põllumajandusministeerium",
    VS: "Siseministeerium", PGS: "Siseministeerium", KOV: "Siseministeerium",
    KVTS: "Kaitseministeerium", KaitseS: "Kaitseministeerium",
    KAS: "Kultuuriministeerium", TRKS: "Kultuuriministeerium",
    MeS: "Majandus- ja Kommunikatsiooniministeerium",
    ÜTS: "Majandus- ja Kommunikatsiooniministeerium",
    VMS: "Siseministeerium",
  };

  if (LYHEND_MAP[l]) return LYHEND_MAP[l];

  if (t.includes("töölepingu") || t.includes("sotsiaalhoolekande") || t.includes("ravikindlustus") ||
      t.includes("tööturu") || t.includes("pension") || t.includes("puuetega") ||
      t.includes("lapsehoiu") || t.includes("töövõime"))
    return "Sotsiaalministeerium";
  if (t.includes("äriseadustik") || t.includes("juriidilise") || t.includes("andmekaitse") ||
      t.includes("kohtutäitur") || t.includes("notari") || t.includes("pankroti") ||
      t.includes("lepingut") || t.includes("tsiviilseadustik") || t.includes("karistus") ||
      t.includes("kriminaal") || t.includes("vangla") || t.includes("advokatuuri"))
    return "Justiitsministeerium";
  if (t.includes("riigieelarve") || t.includes("maksukorraldus") || t.includes("hange") ||
      t.includes("maksu") || t.includes("aktsiisi") || t.includes("tolliseadus") ||
      t.includes("riigivaraseadus") || t.includes("audiitori"))
    return "Rahandusministeerium";
  if (t.includes("haridus") || t.includes("ülikool") || t.includes("õppetoetus") ||
      t.includes("kutseõppe") || t.includes("teadus") || t.includes("rakenduskõrg"))
    return "Haridus- ja Teadusministeerium";
  if (t.includes("ehitus") || t.includes("keskkonna") || t.includes("planeerimine") ||
      t.includes("kliima") || t.includes("jäätme") || t.includes("looduskaitse") ||
      t.includes("veeseadus") || t.includes("õhusaaste"))
    return "Kliimaministeerium";
  if (t.includes("politsei") || t.includes("piirivalve") || t.includes("kohalik omavalitsus") ||
      t.includes("elanik") || t.includes("välismaalaste") || t.includes("kodakondlus"))
    return "Siseministeerium";
  if (t.includes("kaitse") || t.includes("riigikaitse") || t.includes("sõjaväe"))
    return "Kaitseministeerium";
  if (t.includes("põllumajandus") || t.includes("metsaseadus") || t.includes("toiduseadus") ||
      t.includes("veterinaar") || t.includes("maakorraldu"))
    return "Regionaal- ja Põllumajandusministeerium";
  if (t.includes("kultuur") || t.includes("muuseum") || t.includes("sport") ||
      t.includes("arhiiv") || t.includes("ringhääling") || t.includes("trükis"))
    return "Kultuuriministeerium";
  if (t.includes("side") || t.includes("transport") || t.includes("raudtee") || t.includes("lennundus") ||
      t.includes("merendus") || t.includes("energiaseadus") || t.includes("elektriturgu") ||
      t.includes("infoühiskond") || t.includes("turismiseadus"))
    return "Majandus- ja Kommunikatsiooniministeerium";
  if (t.includes("välissuhtlemise") || t.includes("konsulaar"))
    return "Välisministeerium";

  return "Muu";
}

async function fetchActCatalog(): Promise<Act[]> {
  if (cachedActs && Date.now() - cacheTime < CACHE_TTL_MS) {
    return cachedActs;
  }

  const res = await fetch("https://www.riigiteataja.ee/lyhendid.html", {
    headers: { "Accept-Language": "et-EE,et;q=0.9", "User-Agent": "Mozilla/5.0" },
  });

  if (!res.ok) throw new Error(`RT fetch failed: ${res.status}`);
  const html = await res.text();

  const acts: Act[] = [];

  // Extract tbody content only
  const tbodyMatch = html.match(/<tbody>([\s\S]*?)<\/tbody>/i);
  if (!tbodyMatch) throw new Error("No tbody found in lyhendid.html");
  const tbody = tbodyMatch[1];

  // Each row: <tr><td><a href="...akt/{numericId}">{title}</a></td><td><a href="...akt/{lyhend}">{lyhend}</a></td></tr>
  const rowRegex = /<tr[\s\S]*?<\/tr>/gi;
  let row: RegExpExecArray | null;

  while ((row = rowRegex.exec(tbody)) !== null) {
    const rowHtml = row[0];
    // Match numeric act ID (title link)
    const idMatch = rowHtml.match(/href="[^"]*\/akt\/(\d{6,})"[^>]*>([^<]+)<\/a>/);
    // Match lyhend (abbreviation link — non-numeric href segment)
    const lyhendMatch = rowHtml.match(/href="[^"]*\/akt\/([A-ZÜÕÖÄ][A-ZÜÕÖÄa-züõöä0-9\-]{1,20})"[^>]*>([^<]+)<\/a>/);

    if (!idMatch) continue;
    const id = idMatch[1];
    const title = idMatch[2].trim();
    const lyhend = lyhendMatch ? lyhendMatch[2].trim() : "";

    if (!title || title.length < 3) continue;

    acts.push({
      id,
      title,
      lyhend,
      rt_url: `https://www.riigiteataja.ee/akt/${id}`,
      ministry: guessMinistry(title, lyhend),
    });
  }

  cachedActs = acts;
  cacheTime = Date.now();
  return acts;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const q = (url.searchParams.get("q") ?? "").toLowerCase().trim();
    const ministry = (url.searchParams.get("ministry") ?? "").trim();
    const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "30"), 100);

    const acts = await fetchActCatalog();

    let filtered = acts;

    if (ministry) {
      filtered = filtered.filter((a) => a.ministry === ministry);
    }

    if (q) {
      filtered = filtered.filter(
        (a) =>
          a.title.toLowerCase().includes(q) ||
          a.lyhend.toLowerCase().includes(q)
      );
    }

    // If no filters, return first batch so UI has something to show
    return new Response(JSON.stringify(filtered.slice(0, limit)), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
