import { useState, useEffect, useMemo, useRef } from "react";
import { tokenizeEt, scoreActVsDraft } from "@/lib/relevance";

interface Act {
  id: string;
  title: string;
  lyhend: string;
  rt_url: string;
  ministry: string;
}

type Relevance = "high" | "medium";
type ScoredAct = { act: Act; relevance: Relevance };
type Status = "loading" | "ready" | "error";

interface Props {
  changeText: string;
  supabaseUrl: string;
  supabaseKey: string;
  onAnalyse: (acts: Act[]) => void;
  loading: boolean;
}

export function AutoActFinder({ changeText, supabaseUrl, supabaseKey, onAnalyse, loading }: Props) {
  const [allActs, setAllActs] = useState<Act[]>([]);
  const [status, setStatus] = useState<Status>("loading");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [initialized, setInitialized] = useState(false);
  const [manualQuery, setManualQuery] = useState("");
  const [manualResults, setManualResults] = useState<Act[]>([]);
  const [manualSearching, setManualSearching] = useState(false);
  const manualDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const headers = { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` };

  const draftTokens = useMemo(() => tokenizeEt(changeText), [changeText]);

  useEffect(() => {
    fetch(`${supabaseUrl}/functions/v1/list-acts?limit=200`, { headers })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data: Act[]) => {
        setAllActs(data);
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  }, []);

  const candidates: ScoredAct[] = useMemo(() => {
    const scored = allActs
      .map((act) => ({ act, relevance: scoreActVsDraft(act.title, act.lyhend, draftTokens) }))
      .filter((x): x is ScoredAct => x.relevance !== null);
    scored.sort((a, b) => (a.relevance === "high" ? 0 : 1) - (b.relevance === "high" ? 0 : 1));
    return scored.slice(0, 20);
  }, [allActs, draftTokens]);

  // Auto-select on first load
  useEffect(() => {
    if (!initialized && candidates.length > 0) {
      setInitialized(true);
      const high = candidates.filter((c) => c.relevance === "high").slice(0, 8);
      const toSelect = high.length >= 2 ? high : candidates.slice(0, 6);
      setSelected(new Set(toSelect.map((c) => c.act.id)));
    }
  }, [candidates, initialized]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  // Merge candidates + manual results, keeping selection state
  const candidateIds = useMemo(() => new Set(candidates.map((c) => c.act.id)), [candidates]);

  const selectedActs = useMemo(
    () => [
      ...candidates.filter((c) => selected.has(c.act.id)).map((c) => c.act),
      ...manualResults.filter((a) => selected.has(a.id) && !candidateIds.has(a.id)),
    ],
    [candidates, manualResults, selected, candidateIds]
  );

  const handleManualSearch = (q: string) => {
    setManualQuery(q);
    if (manualDebounce.current) clearTimeout(manualDebounce.current);
    if (!q.trim()) { setManualResults([]); return; }
    manualDebounce.current = setTimeout(async () => {
      setManualSearching(true);
      try {
        const res = await fetch(
          `${supabaseUrl}/functions/v1/list-acts?q=${encodeURIComponent(q)}&limit=20`,
          { headers }
        );
        setManualResults(res.ok ? await res.json() : []);
      } finally {
        setManualSearching(false);
      }
    }, 300);
  };

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center py-16 text-neutral-400">
        <div className="text-center">
          <div className="mx-auto mb-3 h-7 w-7 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-700" />
          <p className="text-sm">Otsin seotud õigusakte…</p>
          <p className="mt-1 text-xs text-neutral-300">Kontrollin kataloogi</p>
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="rounded-md border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-600">
        Õigusaktide kataloogi laadimine ebaõnnestus.{" "}
        <button onClick={() => window.location.reload()} className="underline">
          Laadi uuesti
        </button>
      </div>
    );
  }

  const highCount = candidates.filter((c) => c.relevance === "high").length;
  const medCount = candidates.filter((c) => c.relevance === "medium").length;

  return (
    <div className="flex flex-col gap-4">
      {/* Summary card */}
      <div className="rounded-md border border-neutral-200 bg-white px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            {candidates.length === 0 ? (
              <p className="text-sm font-medium text-neutral-700">
                Ühtegi selgelt seotud akti ei tuvastatud
              </p>
            ) : (
              <p className="text-sm font-medium text-neutral-800">
                {highCount > 0 && <span className="text-green-700">{highCount} tugevalt seotud</span>}
                {highCount > 0 && medCount > 0 && <span className="text-neutral-400"> · </span>}
                {medCount > 0 && <span className="text-neutral-600">{medCount} osaliselt seotud</span>}
              </p>
            )}
            <p className="mt-0.5 text-xs text-neutral-400">
              Skannitud {allActs.length} akti · {selected.size} valitud analüüsiks
            </p>
          </div>
          <span className="shrink-0 rounded bg-neutral-100 px-2 py-0.5 text-[11px] text-neutral-500">
            Automaatne tuvastus
          </span>
        </div>
      </div>

      {/* Candidates list */}
      <div className="rounded-md border border-neutral-200 overflow-hidden">
        {candidates.length === 0 ? (
          <div className="p-6 text-center">
            <p className="text-sm text-neutral-500">
              Muudatuse tekstist ei tuvastatud piisavalt märksõnu.
            </p>
            <p className="mt-1 text-xs text-neutral-400">
              Kasuta allpool olevat otsingut aktide käsitsi lisamiseks või täienda muudatuse kirjeldust.
            </p>
          </div>
        ) : (
          candidates.map(({ act, relevance }) => (
            <button
              key={act.id}
              onClick={() => toggle(act.id)}
              className={`flex w-full items-center gap-3 border-b border-neutral-100 px-4 py-3 text-left transition-colors last:border-0 hover:bg-neutral-50 ${
                selected.has(act.id) ? "bg-neutral-50" : ""
              }`}
            >
              <span
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] transition-colors ${
                  selected.has(act.id) ? "border-black bg-black text-white" : "border-neutral-300"
                }`}
              >
                {selected.has(act.id) ? "✓" : ""}
              </span>
              <span className="flex-1 min-w-0">
                <span className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-neutral-900">{act.title}</span>
                  <span
                    className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${
                      relevance === "high"
                        ? "bg-green-100 text-green-700"
                        : "bg-neutral-100 text-neutral-500"
                    }`}
                  >
                    {relevance === "high" ? "Seotud" : "Võib olla seotud"}
                  </span>
                </span>
                <span className="mt-0.5 flex items-center gap-2">
                  {act.lyhend && (
                    <span className="font-mono text-[11px] text-neutral-400">{act.lyhend}</span>
                  )}
                  <span className="text-[11px] text-neutral-300">{act.ministry}</span>
                </span>
              </span>
            </button>
          ))
        )}
      </div>

      {/* Manual search fallback */}
      <details className="group">
        <summary className="cursor-pointer list-none text-xs text-neutral-400 underline underline-offset-2 hover:text-neutral-700">
          Lisa akt käsitsi otsinguga ↓
        </summary>
        <div className="mt-2 space-y-2">
          <input
            type="search"
            placeholder="Otsi pealkirja järgi…"
            value={manualQuery}
            onChange={(e) => handleManualSearch(e.target.value)}
            className="w-full rounded-md border border-neutral-200 px-3 py-2 text-sm focus:border-neutral-400 focus:outline-none"
          />
          {manualSearching && <p className="text-xs text-neutral-400">Otsin…</p>}
          {manualResults.length > 0 && (
            <div className="rounded-md border border-neutral-200 overflow-hidden">
              {manualResults.map((act) => (
                <button
                  key={act.id}
                  onClick={() => {
                    if (!manualResults.find((a) => a.id === act.id)) return;
                    toggle(act.id);
                  }}
                  className={`flex w-full items-center gap-3 border-b border-neutral-100 px-4 py-2.5 text-left hover:bg-neutral-50 last:border-0 ${
                    selected.has(act.id) ? "bg-neutral-50" : ""
                  }`}
                >
                  <span
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] ${
                      selected.has(act.id) ? "border-black bg-black text-white" : "border-neutral-300"
                    }`}
                  >
                    {selected.has(act.id) ? "✓" : ""}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block truncate text-sm font-medium text-neutral-900">{act.title}</span>
                    <span className="text-[11px] text-neutral-400">{act.lyhend} · {act.ministry}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </details>

      {/* Disclaimer */}
      <p className="text-[11px] text-neutral-400 leading-relaxed">
        Tuvastus põhineb märksõnalisel vastavusel, mitte sisulise analüüsi põhjal. Valimata
        jätmine ei tähenda, et akt pole seotud. Kõik tulemused vajavad inimese ülevaatust.
      </p>

      {/* CTA */}
      <button
        onClick={() => onAnalyse(selectedActs)}
        disabled={selected.size === 0 || loading}
        className="w-full rounded-md bg-black py-2.5 text-sm font-medium text-white transition-colors hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-300"
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            Otsin seoseid…
          </span>
        ) : (
          `Käivita esmane kontroll (${selected.size} akti) →`
        )}
      </button>
    </div>
  );
}
