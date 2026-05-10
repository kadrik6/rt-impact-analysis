/**
 * Edge Function: list-drafts
 * Proxies Riigikogu EMS API draft search.
 * GET /functions/v1/list-drafts?q=tööleping&size=20&type=SE
 */

import { corsHeaders } from "../_shared/cors.ts";

const EMS_BASE = "https://api.riigikogu.ee/api";

const STAGE_LABELS: Record<string, string> = {
  MENETLUSSE_VOETUD: "Menetlusse võetud",
  ESIMENE_LUGEMINE: "I lugemine",
  TEINE_LUGEMINE: "II lugemine",
  KOLMAS_LUGEMINE: "III lugemine",
  VASTUVOTMINE: "Vastuvõtmine",
  SEADUS_VASTU_VOETUD: "Vastu võetud",
  TAGASI_LÜKATUD: "Tagasi lükatud",
  MENETLUSEST_TAGASI_VOETUD: "Menetlusest tagasi võetud",
};

const TYPE_LABELS: Record<string, string> = {
  SE: "Seaduseelnõu",
  OE: "Otsuse eelnõu",
  AE: "Avalduse eelnõu",
  KE: "Korralduse eelnõu",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const q = (url.searchParams.get("q") ?? "").trim();
    const size = Math.min(parseInt(url.searchParams.get("size") ?? "25"), 50);
    const type = url.searchParams.get("type") ?? "";
    const status = url.searchParams.get("status") ?? "";

    const params = new URLSearchParams({ lang: "et", size: String(size) });
    if (q) params.set("title", q);
    if (type) params.set("draftTypeCode", type);
    if (status) params.set("proceedingStatus", status);

    const res = await fetch(`${EMS_BASE}/volumes/drafts?${params}`, {
      headers: { "Accept": "application/json" },
    });

    if (!res.ok) throw new Error(`EMS API ${res.status}`);

    const data = await res.json() as {
      _embedded?: { content?: unknown[] };
    };

    const items = (data._embedded?.content ?? []) as Array<Record<string, unknown>>;

    const drafts = items.map((d) => {
      const lc = d.leadingCommittee as Record<string, unknown> | null;
      return {
        uuid: d.uuid,
        title: d.title,
        mark: d.mark,
        draftTypeCode: d.draftTypeCode,
        draftTypeLabel: TYPE_LABELS[d.draftTypeCode as string] ?? String(d.draftTypeCode ?? ""),
        stage: STAGE_LABELS[d.activeDraftStage as string] ?? String(d.activeDraftStage ?? ""),
        proceedingStatus: d.proceedingStatus,
        leadingCommittee: lc ? lc.name : null,
        initiated: d.initiated,
        riigikoguUrl: `https://www.riigikogu.ee/tegevus/eelnoud/eelnou/${d.uuid}`,
      };
    });

    return new Response(JSON.stringify(drafts), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
