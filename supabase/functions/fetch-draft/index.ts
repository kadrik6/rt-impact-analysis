/**
 * Edge Function: fetch-draft
 * Returns Riigikogu draft metadata + introduction text.
 * Optional ?full=true attempts PDF extraction (may hit rate limits).
 * GET /functions/v1/fetch-draft?uuid=xxx
 * GET /functions/v1/fetch-draft?uuid=xxx&full=true
 */

import { corsHeaders } from "../_shared/cors.ts";

const EMS_BASE = "https://api.riigikogu.ee/api";

interface RKFile {
  fileName: string;
  fileExtension: string;
  fileTitle: string;
  _links: { download: { href: string } };
}

interface RKText {
  readingCode: string | null;
  document: { title: string; documentType: string };
  file: RKFile;
}

interface RKDetail {
  title: string;
  titleWithMarkAndTypeCode: string;
  introduction: string;
  initiated: string;
  accepted: string | null;
  texts: RKText[];
  descriptors: Array<{ text: string }>;
  leadingCommittee: { name: string } | null;
  initiators: Array<{ name?: string; fullName?: string }>;
  readings: Array<{ readingCode: string; date: string }>;
}

function pickBestPdf(texts: RKText[]): RKFile | null {
  const pdfs = texts
    .filter((t) => t.file?.fileExtension === "pdf")
    .sort((a, b) => {
      const score = (f: RKFile) =>
        (/eeln/i.test(f.fileTitle) && !/seletus/i.test(f.fileTitle)) ? 1 : 0;
      return score(b.file) - score(a.file);
    });
  return pdfs[0]?.file ?? null;
}

async function extractPdfText(url: string): Promise<string> {
  // Lazy-import unpdf only when actually needed
  const { extractText, getDocumentProxy } = await import("npm:unpdf@0.12.1");
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  if (res.status === 429) throw new Error("rate_limited");
  if (!res.ok) throw new Error(`pdf_fetch_${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  const doc = await getDocumentProxy(bytes);
  const extracted = await extractText(doc, { mergePages: true });
  return Array.isArray(extracted.text) ? extracted.text.join("\n") : String(extracted.text);
}

function buildText(detail: RKDetail, pdfText?: string): string {
  const parts: string[] = [];

  parts.push(`EELNÕU: ${detail.titleWithMarkAndTypeCode || detail.title}`);

  if (detail.initiated) parts.push(`Algatatud: ${detail.initiated}`);

  const committee = detail.leadingCommittee?.name;
  if (committee) parts.push(`Juhtivkomisjon: ${committee}`);

  const keywords = detail.descriptors?.map((d) => d.text).join(", ");
  if (keywords) parts.push(`Märksõnad: ${keywords}`);

  const lastReading = detail.readings?.at(-1);
  if (lastReading) parts.push(`Menetlusetapp: ${lastReading.readingCode} (${lastReading.date})`);

  if (detail.introduction) {
    parts.push(`\nKOKKUVÕTE:\n${detail.introduction}`);
  }

  if (pdfText) {
    parts.push(`\nTÄISTEKST:\n${pdfText}`);
  }

  return parts.join("\n");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const uuid = url.searchParams.get("uuid");
    const wantFull = url.searchParams.get("full") === "true";

    if (!uuid) {
      return new Response(JSON.stringify({ error: "uuid required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const detailRes = await fetch(`${EMS_BASE}/volumes/drafts/${uuid}?lang=et`);
    if (!detailRes.ok) throw new Error(`EMS ${detailRes.status}`);
    const detail = await detailRes.json() as RKDetail;

    let pdfText: string | undefined;
    let textSource: "full_pdf" | "introduction" = "introduction";
    let pdfError: string | undefined;

    if (wantFull) {
      const pdfFile = pickBestPdf(detail.texts ?? []);
      if (pdfFile) {
        try {
          pdfText = await extractPdfText(pdfFile._links.download.href);
          textSource = "full_pdf";
        } catch (e) {
          pdfError = e instanceof Error ? e.message : String(e);
          // fall back to introduction — don't throw
        }
      }
    }

    const text = buildText(detail, pdfText);
    const hasPdf = (detail.texts ?? []).some((t) => t.file?.fileExtension === "pdf");

    return new Response(
      JSON.stringify({
        uuid,
        title: detail.title,
        introduction: detail.introduction ?? "",
        keywords: (detail.descriptors ?? []).map((d) => d.text),
        text,
        textSource,
        hasPdf,
        pdfError: pdfError ?? null,
        riigikoguUrl: `https://www.riigikogu.ee/tegevus/eelnoud/eelnou/${uuid}`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
