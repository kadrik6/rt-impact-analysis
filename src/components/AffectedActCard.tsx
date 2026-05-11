import { useState } from "react";
import type { AffectedAct } from "@/types";
import { Tooltip } from "./Tooltip";

// Severity based on confidence + risk_score
function getSeverity(act: AffectedAct): "low" | "medium" | "high" {
  const score = act.risk_score ?? act.confidence * 40;
  if (score >= 20 || act.confidence >= 0.65) return "high";
  if (score >= 10 || act.confidence >= 0.38) return "medium";
  return "low";
}

const SEVERITY_CONFIG = {
  low: {
    label: "Madal seos",
    desc: "Leiti üksikuid sarnaseid sõnu. Mõju ei ole selge.",
    border: "border-neutral-200",
    badge: "bg-neutral-100 text-neutral-600",
    bar: "bg-neutral-300",
  },
  medium: {
    label: "Keskmine seos",
    desc: "Leiti mitu kattuvat terminit. Vajab ülevaatust.",
    border: "border-amber-200",
    badge: "bg-amber-50 text-amber-700",
    bar: "bg-amber-400",
  },
  high: {
    label: "Kõrge seos",
    desc: "Leiti palju kattuvaid termineid või seotud paragrahve. Sisuline kontroll on soovitatav.",
    border: "border-orange-200",
    badge: "bg-orange-50 text-orange-700",
    bar: "bg-orange-400",
  },
};

const IMPACT_LABELS: Record<AffectedAct["impact_type"], string> = {
  conflict: "Võimalik mõju",
  amendment_required: "Kontrolli vajab",
  cross_reference: "Seotud viide",
  obsolete: "Võimalik asendus",
};

const CHECKLIST_ITEMS = [
  "Kas see akt on päriselt teemaga seotud?",
  "Kas muudatus mõjutab õigusi või kohustusi?",
  "Kas muudatus muudab tähtaegu?",
  "Kas muudatus puudutab andmeid või registrit?",
  "Kas muudatus annab asutusele uue ülesande?",
  "Kas muudatus võib tekitada kulu või halduskoormust?",
  "Kas see vajab juristi või valdkonna eksperdi ülevaatust?",
];

const NEXT_STEPS = [
  "Vaata seotud paragrahvid üle",
  "Kontrolli, kas seos on sisuline või ainult sõnastuslik",
  "Vajadusel küsi AI-lt lisaselgitust",
  "Vajadusel suuna vastutavale asutusele",
];

interface Props {
  act: AffectedAct;
  onConfirm: () => void;
  onFlag: () => void;
}

export function AffectedActCard({ act, onConfirm, onFlag }: Props) {
  const [showChecklist, setShowChecklist] = useState(false);
  const [showWhyFound, setShowWhyFound] = useState(false);
  const [checkedItems, setCheckedItems] = useState<Set<number>>(new Set());
  const severity = getSeverity(act);
  const cfg = SEVERITY_CONFIG[severity];
  const isDismissed = act.confirmed === false;

  const toggleCheck = (i: number) =>
    setCheckedItems((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });

  return (
    <div className={`rounded-md border ${cfg.border} bg-white transition-opacity ${isDismissed ? "opacity-40" : ""}`}>
      {/* Severity bar — green for directly amended acts */}
      <div className={`h-1 rounded-t-md ${act.directly_amended ? "bg-emerald-500" : cfg.bar}`} />

      <div className="p-4">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              {act.directly_amended && (
                <span className="rounded px-2 py-0.5 text-[11px] font-semibold bg-emerald-600 text-white">
                  Otseselt muudetav
                </span>
              )}
              {act.category && !act.directly_amended && (
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-mono font-bold ${
                  act.category === "A"
                    ? "bg-neutral-800 text-white"
                    : "bg-neutral-200 text-neutral-600"
                }`}>
                  {act.category}
                </span>
              )}
              {!act.directly_amended && (
                <span className={`rounded px-2 py-0.5 text-[11px] font-medium ${cfg.badge}`}>
                  {cfg.label}
                </span>
              )}
              <span className="rounded bg-neutral-100 px-2 py-0.5 text-[11px] text-neutral-500">
                {IMPACT_LABELS[act.impact_type]}
              </span>
              <span className="flex items-center gap-1 text-[11px] text-neutral-400">
                {Math.round(act.confidence * 100)}% kattuvus
                <Tooltip text="Kattuvus näitab, kui palju sarnaseid sõnu ja teemasid tekstides leidub. See ei tähenda, et vastuolu on olemas — see tähendab, et seos vajab inimese ülevaatust." />
              </span>
            </div>

            <h3 className="mt-2 font-semibold text-neutral-900 leading-snug">{act.act_title}</h3>
            <p className="mt-0.5 font-mono text-[11px] text-neutral-400">{act.rt_identifier}</p>
          </div>
        </div>

        {/* Reason */}
        <p className="mt-3 text-sm leading-relaxed text-neutral-700">{act.reason}</p>

        {/* Severity description */}
        <p className="mt-1 text-xs text-neutral-500 italic">{cfg.desc}</p>

        {/* Paragraphs */}
        {act.paragraphs.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            <span className="text-[11px] text-neutral-400 self-center">Võimalikult seotud:</span>
            {act.paragraphs.map((p) => (
              <span key={p} className="rounded bg-neutral-100 px-2 py-0.5 font-mono text-xs text-neutral-600">
                {p}
              </span>
            ))}
          </div>
        )}

        {/* Ministry hints */}
        {act.ministryHints && act.ministryHints.length > 0 ? (
          <div className="mt-3">
            <div className="flex items-center gap-1 mb-1.5">
              <span className="text-[11px] text-neutral-400">Võimalikud kaasatavad asutused:</span>
              <Tooltip text="Asutused on tuletatud akti lühendi, pealkirja ja märksõnade põhjal. See on abivahend, mitte ametlik vastutaja. Kontrolli tegelik vastutus EIS-ist või seletuskirjast." />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {act.ministryHints.map((hint) => (
                <span
                  key={hint.name}
                  title={hint.keywords?.join(", ")}
                  className={`rounded px-2 py-0.5 text-[11px] border ${
                    hint.confidence === "high"
                      ? "border-neutral-400 bg-neutral-100 text-neutral-700"
                      : hint.confidence === "medium"
                      ? "border-neutral-300 bg-neutral-50 text-neutral-600"
                      : "border-neutral-200 bg-white text-neutral-400"
                  }`}
                >
                  {hint.name}
                  <span className="ml-1 opacity-50">
                    {hint.confidence === "high" ? "●●●" : hint.confidence === "medium" ? "●●○" : "●○○"}
                  </span>
                </span>
              ))}
            </div>
          </div>
        ) : (
          <p className="mt-2 text-xs text-neutral-400">
            Vastutav asutus määramata — kontrolli EIS-ist
          </p>
        )}

        {/* Expandable sections */}
        <div className="mt-3 flex flex-wrap gap-3 text-[11px]">
          <button
            onClick={() => setShowWhyFound((v) => !v)}
            className="text-neutral-500 underline underline-offset-2 hover:text-neutral-800"
          >
            {showWhyFound ? "Peida selgitus" : "Miks see leiti?"}
          </button>
          <button
            onClick={() => setShowChecklist((v) => !v)}
            className="text-neutral-500 underline underline-offset-2 hover:text-neutral-800"
          >
            {showChecklist ? "Peida kontrollnimekiri" : "Kontrolli üle →"}
          </button>
        </div>

        {/* Why found */}
        {showWhyFound && (
          <div className="mt-3 rounded-md bg-neutral-50 p-3 text-xs text-neutral-600 space-y-2">
            <p className="font-medium text-neutral-700">Miks see leiti?</p>
            {act.relevance_check && (
              <div className="rounded border-l-2 border-neutral-300 pl-2 text-neutral-700 italic">
                {act.relevance_check}
              </div>
            )}
            {act.keyword_hits && act.keyword_hits.length > 0 ? (
              <p>
                Kattuvad märksõnad:{" "}
                <span className="font-medium">
                  {act.keyword_hits.map((k) => `„${k}"`).join(", ")}
                </span>
              </p>
            ) : (
              <p>Leiti tekstiline kattuvus eelnõu ja selle akti paragrahvide vahel.</p>
            )}
            <p className="text-neutral-400">
              See on automaatne soovitus — kontrolli, kas seos on sisuline või ainult sõnaline.
            </p>
          </div>
        )}

        {/* Checklist */}
        {showChecklist && (
          <div className="mt-3 rounded-md border border-neutral-200 p-3">
            <p className="text-xs font-medium text-neutral-700 mb-2">Kriitilise ülevaatuse kontrollnimekiri</p>
            <div className="space-y-2">
              {CHECKLIST_ITEMS.map((item, i) => (
                <label key={i} className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={checkedItems.has(i)}
                    onChange={() => toggleCheck(i)}
                    className="mt-0.5 shrink-0"
                  />
                  <span className="text-xs text-neutral-700">{item}</span>
                </label>
              ))}
            </div>
            <div className="mt-3 border-t border-neutral-100 pt-3">
              <p className="text-[11px] font-medium text-neutral-500 mb-1.5">Mida edasi teha?</p>
              <ul className="space-y-1">
                {NEXT_STEPS.map((s, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-[11px] text-neutral-500">
                    <span className="text-neutral-300 shrink-0">→</span>
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-neutral-100 px-4 py-2.5">
        <a
          href={act.rt_url}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-neutral-500 underline underline-offset-2 hover:text-neutral-800"
        >
          Ava Riigi Teatajas →
        </a>
        <div className="flex gap-2">
          {!isDismissed ? (
            <>
              <button
                onClick={onFlag}
                className="rounded px-3 py-1 text-xs text-neutral-500 hover:bg-neutral-100"
              >
                Märgi ebaoluliseks
              </button>
              <button
                onClick={onConfirm}
                className="rounded border border-neutral-300 bg-white px-3 py-1 text-xs text-neutral-700 hover:bg-neutral-50"
              >
                Kinnita ülevaatuseks ✓
              </button>
            </>
          ) : (
            <button
              onClick={onConfirm}
              className="text-xs text-neutral-400 underline hover:text-neutral-600"
            >
              Taasta
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
