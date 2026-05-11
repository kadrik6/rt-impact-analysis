import { useState, useEffect, useRef, useMemo } from "react";
import { tokenizeEt, scoreActVsDraft } from "@/lib/relevance";

interface Act {
  id: string;
  title: string;
  lyhend: string;
  rt_url: string;
  ministry: string;
}

interface Props {
  selected: Act[];
  onSelectionChange: (acts: Act[]) => void;
  supabaseUrl: string;
  supabaseKey: string;
  draftText?: string;
}

const MINISTRIES = [
  "Sotsiaalministeerium",
  "Justiitsministeerium",
  "Rahandusministeerium",
  "Haridus- ja Teadusministeerium",
  "Kliimaministeerium",
  "Siseministeerium",
  "Kaitseministeerium",
  "Regionaal- ja Põllumajandusministeerium",
  "Kultuuriministeerium",
  "Majandus- ja Kommunikatsiooniministeerium",
  "Välisministeerium",
  "Muu",
];

export function ActSearch({ selected, onSelectionChange, supabaseUrl, supabaseKey, draftText }: Props) {
  const [query, setQuery] = useState("");
  const [ministry, setMinistry] = useState("");
  const [results, setResults] = useState<Act[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const draftTokens = useMemo(() => tokenizeEt(draftText ?? ""), [draftText]);

  const search = async (q: string, min: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "50" });
      if (q) params.set("q", q);
      if (min) params.set("ministry", min);
      const url = `${supabaseUrl}/functions/v1/list-acts?${params}`;
      const res = await fetch(url, {
        headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` },
      });
      if (!res.ok) throw new Error(`${res.status}`);
      setResults(await res.json());
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(query, ministry), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, ministry]);

  useEffect(() => { search("", ""); }, []);

  const toggle = (act: Act) => {
    const isSelected = selected.some((s) => s.id === act.id);
    onSelectionChange(
      isSelected ? selected.filter((s) => s.id !== act.id) : [...selected, act]
    );
  };

  const isSelected = (id: string) => selected.some((s) => s.id === id);

  return (
    <div className="flex h-full flex-col gap-3">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-widest text-neutral-500">
          01 — Vali analüüsitavad aktid
        </h2>
        <p className="mt-1 text-xs text-neutral-400">
          Otsi Riigi Teatajast · {selected.length} valitud
        </p>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        <input
          type="search"
          placeholder="Otsi pealkirja või lühendi järgi…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="min-w-0 flex-1 rounded-md border border-neutral-200 px-3 py-2 text-sm focus:border-neutral-400 focus:outline-none"
        />
        <select
          value={ministry}
          onChange={(e) => setMinistry(e.target.value)}
          className="rounded-md border border-neutral-200 bg-white px-2 py-2 text-xs text-neutral-600 focus:border-neutral-400 focus:outline-none"
        >
          <option value="">Kõik ministeeriumid</option>
          {MINISTRIES.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      </div>

      {/* Selected chips */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((a) => (
            <span
              key={a.id}
              className="flex items-center gap-1 rounded-full bg-black px-3 py-1 text-xs text-white"
            >
              {a.lyhend || a.title.slice(0, 20)}
              <button
                onClick={() => toggle(a)}
                className="ml-1 text-white/60 hover:text-white"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Results list */}
      <div className="flex-1 overflow-y-auto rounded-md border border-neutral-200">
        {loading && (
          <div className="flex items-center justify-center py-8 text-xs text-neutral-400">
            Otsin Riigi Teatajast…
          </div>
        )}
        {!loading && results.length === 0 && (
          <div className="flex items-center justify-center py-8 text-xs text-neutral-400">
            Tulemused puuduvad
          </div>
        )}
        {!loading &&
          results.map((act) => {
            const relevance = scoreActVsDraft(act.title, act.lyhend, draftTokens);
            return (
              <button
                key={act.id}
                onClick={() => toggle(act)}
                className={`flex w-full items-center gap-3 border-b border-neutral-100 px-4 py-3 text-left transition-colors last:border-0 hover:bg-neutral-50 ${
                  isSelected(act.id) ? "bg-neutral-50" : ""
                }`}
              >
                <span
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] transition-colors ${
                    isSelected(act.id)
                      ? "border-black bg-black text-white"
                      : "border-neutral-300"
                  }`}
                >
                  {isSelected(act.id) ? "✓" : ""}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="flex items-center gap-2">
                    <span className="block truncate text-sm font-medium text-neutral-900">
                      {act.title}
                    </span>
                    {relevance === "high" && (
                      <span className="shrink-0 rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-700">
                        Seotud
                      </span>
                    )}
                    {relevance === "medium" && (
                      <span className="shrink-0 rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] text-neutral-500">
                        Võib olla seotud
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 flex items-center gap-2">
                    {act.lyhend && (
                      <span className="font-mono text-[11px] text-neutral-400">{act.lyhend}</span>
                    )}
                    <span className="text-[11px] text-neutral-300">{act.ministry}</span>
                  </span>
                </span>
              </button>
            );
          })}
      </div>
    </div>
  );
}
