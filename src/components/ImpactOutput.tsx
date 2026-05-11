import React, { useState } from "react";
import type { ImpactAnalysis } from "@/types";
import type { ExcludedAct } from "@/lib/feedback";
import { AffectedActCard } from "./AffectedActCard";
import { Tooltip } from "./Tooltip";

interface Props {
  analysis: ImpactAnalysis | null;
  loading: boolean;
  error: string | null;
  onConfirm: (idx: number) => void;
  onFlag: (idx: number) => void;
  excludedActs?: ExcludedAct[];
  onClearExclusion?: (rt_identifier: string) => void;
  onClearAllExclusions?: () => void;
  onGenerateReport?: () => Promise<string>;
}

function MarkdownReport({ text }: { text: string }) {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let listBuffer: string[] = [];
  let key = 0;

  const flushList = () => {
    if (listBuffer.length === 0) return;
    elements.push(
      <ul key={key++} className="my-3 space-y-1 pl-4">
        {listBuffer.map((item, i) => (
          <li key={i} className="flex gap-2 text-sm text-neutral-700">
            <span className="mt-1 shrink-0 text-neutral-400">–</span>
            <span dangerouslySetInnerHTML={{ __html: renderInline(item) }} />
          </li>
        ))}
      </ul>
    );
    listBuffer = [];
  };

  const renderInline = (s: string) =>
    s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

  for (const raw of lines) {
    const line = raw.trimEnd();

    if (/^## /.test(line)) {
      flushList();
      elements.push(
        <h2 key={key++} className="mb-2 mt-6 text-lg font-bold text-neutral-900 first:mt-0">
          {line.replace(/^## /, "")}
        </h2>
      );
    } else if (/^### /.test(line)) {
      flushList();
      elements.push(
        <h3 key={key++} className="mb-1 mt-4 text-base font-semibold text-neutral-800">
          {line.replace(/^### /, "")}
        </h3>
      );
    } else if (/^- /.test(line) || /^\* /.test(line)) {
      listBuffer.push(line.replace(/^[-*] /, ""));
    } else if (line === "") {
      flushList();
    } else {
      flushList();
      elements.push(
        <p
          key={key++}
          className="my-2 text-sm leading-relaxed text-neutral-700"
          dangerouslySetInnerHTML={{ __html: renderInline(line) }}
        />
      );
    }
  }
  flushList();

  return <div className="prose-sm max-w-none">{elements}</div>;
}

export function ImpactOutput({ analysis, loading, error, onConfirm, onFlag, excludedActs, onClearExclusion, onClearAllExclusions, onGenerateReport }: Props) {
  const [reportText, setReportText] = useState<string | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleGenerateReport = async () => {
    if (!onGenerateReport) return;
    setReportLoading(true);
    setReportError(null);
    try {
      const text = await onGenerateReport();
      setReportText(text);
    } catch (e) {
      setReportError(e instanceof Error ? e.message : "Viga mustandi genereerimisel");
    } finally {
      setReportLoading(false);
    }
  };

  const handleCopy = () => {
    if (!reportText) return;
    navigator.clipboard.writeText(reportText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-neutral-400">
        <div className="text-center">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-800" />
          <p className="text-sm">Otsin võimalikke seoseid…</p>
          <p className="mt-1 text-xs text-neutral-300">See võtab mõne sekundi</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 p-4">
        <p className="text-sm font-medium text-red-700">Viga analüüsis</p>
        <p className="mt-1 text-xs text-red-600">{error}</p>
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center text-neutral-300">
          <p className="text-5xl">§</p>
          <p className="mt-3 text-sm">Tulemus ilmub siia pärast analüüsi käivitamist</p>
        </div>
      </div>
    );
  }

  const isAi = analysis.mode === "ai";
  const isAgentic = analysis.mode === "agentic";
  const confirmed = analysis.affected_acts.filter((a) => a.confirmed === true).length;
  const flagged = analysis.affected_acts.filter((a) => a.confirmed === false).length;
  const active = analysis.affected_acts.filter((a) => a.confirmed !== false);
  const excludedIds = new Set((excludedActs ?? []).map((e) => e.rt_identifier));
  const autoExcluded = analysis.affected_acts.filter(
    (a) => a.confirmed === false && excludedIds.has(a.rt_identifier)
  );
  const directActs = active.filter((a) => a.category === "A");
  const substantiveActs = active.filter((a) => !a.category || a.category === "B");
  const noiseActs = analysis.noise_acts ?? [];

  return (
    <div className="flex flex-col gap-4">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-widest text-neutral-500">
              Võimaliku mõju kontroll
            </h2>
            <Tooltip text="See tulemus näitab tekstilist kattuvust ja võimalikke seoseid. See ei tähenda, et vastuolu on olemas — see näitab, mida inimene peaks edasi kontrollima." />
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-neutral-500">
            <span className={`rounded px-2 py-0.5 text-[11px] font-medium ${
              isAi ? "bg-black text-white"
              : isAgentic ? "bg-black text-white"
              : "bg-neutral-200 text-neutral-600"
            }`}>
              {isAi ? (analysis.from_cache ? "AI · cache" : "AI · Claude")
               : isAgentic ? "Täisanalüüs"
               : analysis.mode === "hybrid" ? "Semantiline otsing"
               : "Reeglipõhine kontroll"}
            </span>
            {isAgentic && (
              <span className="text-[11px] text-neutral-400">
                RAG · AI · {(analysis.tool_calls_made ?? 0) > 0
                  ? `${analysis.tool_calls_made} täpsustust`
                  : "dünaamiline kontroll"}
              </span>
            )}
            <span>{active.length} võimalikult mõjutatud akti</span>
            <span className="text-neutral-300">·</span>
            <span>{analysis.paragraphs_retrieved} paragrahvi vaadatud</span>
            {confirmed > 0 && <span className="text-neutral-600">{confirmed} kinnitatud ülevaatuseks</span>}
            {flagged > 0 && <span className="text-neutral-400">{flagged} märgitud ebaoluliseks</span>}
          </div>
        </div>

      </div>

      {/* ── Disclaimer ── */}
      <div className="rounded-md border border-blue-100 bg-blue-50 px-4 py-3 text-xs text-blue-800 leading-relaxed">
        <span className="font-medium">Kuidas tulemusi lugeda?</span>{" "}
        Iga leitud seos näitab tekstilist kattuvust — mitte kindlat vastuolu. Lõpliku hinnangu
        peab andma inimene, vajadusel koos õigusvaldkonna eksperdiga.
      </div>

      {/* ── Conflicts / check areas ── */}
      {analysis.conflicts_found.length > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
          <div className="flex items-center gap-1.5 mb-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">
              Kontrolli vajavad seosed
            </p>
            <Tooltip text="Need on alad, kus tekstiline kattuvus on kõrge ja sisuline kontroll on eriti soovitatav. See ei tähenda, et viga on olemas." />
          </div>
          <ul className="space-y-1">
            {analysis.conflicts_found.map((c, i) => (
              <li key={i} className="text-sm text-amber-800">— {c}</li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Possible bodies ── */}
      {(analysis.possible_bodies && analysis.possible_bodies.length > 0) && (
        <div className="rounded-md border border-neutral-200 bg-neutral-50 p-3 space-y-3">
          <div className="flex items-center gap-1.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Võimalikud kaasatavad asutused
            </p>
            <Tooltip text="Õigusakti väljaandja ei ole alati sama, mis sisuline vastutaja. Näiteks töötajate puhkust reguleerib töölepingu seadus, mida administreerib Sotsiaalministeerium — aga eelnõu võib olla hoopis Rahandusministeeriumi initsiatiiv. Siin näidatud asutused on tuletatud akti lühendi, pealkirja ja märksõnade põhjal. Kontrolli tegelik vastutus EIS-ist." />
          </div>

          <p className="text-[11px] text-neutral-500 leading-relaxed">
            Õigusakti väljaandja ei pruugi olla sama, mis sisuline vastutaja. Allpool toodud asutused
            on hinnanguline abivahend — kontrolli EIS-i toimikust, kes on vastutav koostaja.
          </p>

          <div className="flex flex-wrap gap-1.5">
            {analysis.possible_bodies.map((h) => (
              <span
                key={h.name}
                title={h.keywords?.join(", ")}
                className={`rounded px-2 py-0.5 text-xs border ${
                  h.confidence === "high"
                    ? "border-neutral-400 bg-white text-neutral-800 font-medium"
                    : h.confidence === "medium"
                    ? "border-neutral-300 bg-white text-neutral-600"
                    : "border-neutral-200 bg-white text-neutral-400"
                }`}
              >
                {h.name}
                <span className="ml-1 text-[10px] opacity-40">
                  {h.confidence === "high" ? "●●●" : h.confidence === "medium" ? "●●○" : "●○○"}
                </span>
              </span>
            ))}
          </div>

          {/* Control questions */}
          <details className="group">
            <summary className="cursor-pointer text-[11px] text-neutral-400 underline underline-offset-2 hover:text-neutral-600 list-none">
              Kontrollküsimused asutuse tuvastamiseks ↓
            </summary>
            <div className="mt-2 space-y-1.5 rounded-md border border-neutral-200 bg-white p-3">
              {[
                "Kas eelnõu on EIS-is olemas? Kui jah, siis kes on seal märgitud vastutajaks?",
                "Kellele eelnõu kooskõlastamiseks saadeti? Kooskõlastusring näitab, kes teemat puudutavaks peab.",
                "Kas seletuskirjas on mainitud konkreetset vastutavat ministeeriumi?",
                "Kas muudetav akt on teise ministeeriumi valitsemisalas? Kui jah, siis tema kaasamine on kohustuslik.",
                "Kas muudatus mõjutab kohalikke omavalitsusi, ameteid või huvirühmi peale ministeeriumide?",
                "Kas aktil on mitu väljaandjat? Mõnel seadusel on kaasallkirjastajad erinevatest ministeeriumidest.",
              ].map((q, i) => (
                <div key={i} className="flex gap-2 text-[11px] text-neutral-600">
                  <span className="shrink-0 font-mono text-neutral-300">{i + 1}.</span>
                  <span>{q}</span>
                </div>
              ))}
            </div>
          </details>
        </div>
      )}

      {/* ── draft_focus (AI only) ── */}
      {analysis.draft_focus && (
        <div className="rounded-md border border-neutral-200 bg-white px-4 py-2.5 text-xs text-neutral-600">
          <span className="font-medium text-neutral-500 uppercase tracking-wide text-[10px]">Eelnõu fookus · </span>
          {analysis.draft_focus}
        </div>
      )}

      {/* ── Act cards — grouped by category ── */}
      {active.length === 0 ? (
        <div className="rounded-md border border-neutral-200 bg-neutral-50 p-6 text-center text-sm text-neutral-500">
          Ühtegi olulist seost ei tuvastatud valitud aktide ja eelnõu teksti vahel.
        </div>
      ) : (
        <div className="space-y-4">
          {/* Category A — directly mentioned */}
          {directActs.length > 0 && (
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                A — Otseselt seotud aktid
              </p>
              <div className="space-y-3">
                {directActs.map((act) => {
                  const i = analysis.affected_acts.indexOf(act);
                  return (
                    <AffectedActCard key={i} act={act} onConfirm={() => onConfirm(i)} onFlag={() => onFlag(i)} />
                  );
                })}
              </div>
            </div>
          )}

          {/* Category B — substantive match */}
          {substantiveActs.length > 0 && (
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                B — Sisuliselt seotud aktid
              </p>
              <div className="space-y-3">
                {substantiveActs.map((act) => {
                  const i = analysis.affected_acts.indexOf(act);
                  return (
                    <AffectedActCard key={i} act={act} onConfirm={() => onConfirm(i)} onFlag={() => onFlag(i)} />
                  );
                })}
              </div>
            </div>
          )}

          {/* Category C — noise, collapsed */}
          {noiseActs.length > 0 && (
            <details className="group">
              <summary className="cursor-pointer list-none">
                <div className="flex items-center gap-2 rounded-md border border-neutral-100 bg-neutral-50 px-3 py-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
                    C — Terminoloogiline müra ({noiseActs.length})
                  </span>
                  <span className="text-[10px] text-neutral-400">
                    — eemaldati, kuna kattuvus on ainult üldterminite põhjal ↓
                  </span>
                </div>
              </summary>
              <div className="mt-1 space-y-1 rounded-md border border-neutral-100 bg-neutral-50 p-3">
                {noiseActs.map((a, i) => (
                  <div key={i} className="text-xs text-neutral-500">
                    <span className="font-medium text-neutral-700">{a.act_title}</span>
                    {a.reason_excluded && (
                      <span className="ml-2 text-neutral-400">— {a.reason_excluded}</span>
                    )}
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}

      {/* ── Feedback memory: auto-excluded acts ── */}
      {autoExcluded.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer list-none">
            <div className="flex items-center justify-between rounded-md border border-neutral-100 bg-neutral-50 px-3 py-2">
              <span className="text-[11px] text-neutral-400">
                {autoExcluded.length} akti välistatud varasema tagasiside põhjal ↓
              </span>
              {onClearAllExclusions && (
                <button
                  onClick={(e) => { e.preventDefault(); onClearAllExclusions(); }}
                  className="text-[10px] text-neutral-400 underline hover:text-neutral-600"
                >
                  Puhasta tagasiside
                </button>
              )}
            </div>
          </summary>
          <div className="mt-1 space-y-1 rounded-md border border-neutral-100 bg-neutral-50 p-3">
            {autoExcluded.map((act) => {
              const stored = (excludedActs ?? []).find((e) => e.rt_identifier === act.rt_identifier);
              return (
                <div key={act.rt_identifier} className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <span className="text-xs text-neutral-600">{act.act_title}</span>
                    {stored && (
                      <span className="ml-2 text-[10px] text-neutral-400">
                        välistatud {stored.count}×
                      </span>
                    )}
                  </div>
                  {onClearExclusion && (
                    <button
                      onClick={() => onClearExclusion(act.rt_identifier)}
                      className="shrink-0 text-[10px] text-neutral-400 underline hover:text-neutral-700"
                    >
                      Taasta
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </details>
      )}

      {/* ── Unresolved ── */}
      {analysis.unresolved && (
        <div className="rounded-md border border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-500">
          <span className="font-medium">Märkus:</span> {analysis.unresolved}
        </div>
      )}

      {/* ── AI warning ── */}
      {isAi && (
        <div className="rounded-md border border-amber-100 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
          <span className="font-medium">AI kasutamise hoiatus:</span>{" "}
          AI võib aidata tulemust selgitada, kuid võib ka eksida. Ära käsitle AI vastust lõpliku
          õigusliku hinnanguna. Kasuta seda esmase abina, mitte otsusena.
        </div>
      )}

      {/* ── AI cost footer ── */}
      {isAi && analysis.input_tokens && (
        <p className="text-[10px] text-neutral-400 text-right">
          {analysis.model_used} · {analysis.input_tokens?.toLocaleString()} + {analysis.output_tokens?.toLocaleString()} tokenit
          {analysis.from_cache && <span className="ml-1 text-green-600">· cache'ist (tasuta)</span>}
        </p>
      )}

      {/* ── Impact report button ── */}
      {onGenerateReport && active.length > 0 && (
        <div className="border-t border-neutral-100 pt-4">
          <button
            onClick={handleGenerateReport}
            disabled={reportLoading}
            className="flex w-full items-center justify-center gap-2 rounded-md border border-neutral-300 bg-white py-2.5 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {reportLoading ? (
              <>
                <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-700" />
                Genereerin mustandit…
              </>
            ) : "Genereeri mõjuanalüüsi mustand →"}
          </button>
          {reportError && (
            <p className="mt-2 text-center text-xs text-red-600">{reportError}</p>
          )}
        </div>
      )}

      {/* ── Report modal ── */}
      {reportText && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 pt-12"
          onClick={(e) => { if (e.target === e.currentTarget) setReportText(null); }}
        >
          <div className="w-full max-w-2xl rounded-xl border border-neutral-200 bg-white shadow-2xl">
            {/* Modal header */}
            <div className="flex items-center justify-between border-b border-neutral-200 px-6 py-4">
              <div>
                <p className="font-semibold text-neutral-900">Mõjuanalüüsi mustand</p>
                <p className="mt-0.5 text-[11px] text-neutral-400">
                  Groq · Llama 3 · AI genereeritud — kontrolli enne ametlikku kasutamist
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCopy}
                  className="rounded-md border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
                >
                  {copied ? "✓ Kopeeritud" : "Kopeeri tekst"}
                </button>
                <button
                  onClick={() => setReportText(null)}
                  className="rounded-md px-2 py-1.5 text-sm text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
                  aria-label="Sulge"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Rendered markdown */}
            <div className="px-6 py-5">
              <MarkdownReport text={reportText} />
            </div>

            {/* Footer */}
            <div className="border-t border-neutral-100 px-6 py-3">
              <p className="text-[11px] text-neutral-400">
                See on automaatselt genereeritud mustand. AI võib eksida — kontrolli
                viidatud paragrahve Riigi Teatajas enne dokumendi avaldamist.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
