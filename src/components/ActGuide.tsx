import { useState } from "react";

interface Suggestion {
  id: string;
  title: string;
  lyhend: string;
  ministry: string;
  reason: string;
  urgency: "kindlasti" | "tõenäoliselt" | "kaaluda";
}

interface Act {
  id: string;
  title: string;
  lyhend: string;
  rt_url: string;
  ministry: string;
}

interface Props {
  supabaseUrl: string;
  supabaseKey: string;
  selected: Act[];
  onAdd: (acts: Act[]) => void;
}

type Phase = "intro" | "input" | "loading" | "results" | "error";

const URGENCY_STYLE: Record<string, string> = {
  kindlasti: "border-black bg-black/5 text-black",
  tõenäoliselt: "border-neutral-400 bg-white text-neutral-700",
  kaaluda: "border-neutral-200 bg-white text-neutral-500",
};

const URGENCY_LABEL: Record<string, string> = {
  kindlasti: "Kindlasti",
  tõenäoliselt: "Tõenäoliselt",
  kaaluda: "Kaaluda",
};

const EXAMPLES = [
  "Eelnõu lühendab katseaja kestust ning lisab töötajale õiguse saada kirjalik põhjendus töölepingu lõpetamisel",
  "Muudame hankekünniseid — riigihangete piirmäärasid tõstetakse ja lihtsustame alla 30 000 € ostude korraldamist",
  "Eelnõu kohustab kõiki avaliku sektori asutusi kasutama lõimitud andmekaitsepõhimõtteid uute IT-süsteemide arendamisel",
];

export function ActGuide({ supabaseUrl, supabaseKey, selected, onAdd }: Props) {
  const [phase, setPhase] = useState<Phase>("intro");
  const [description, setDescription] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");

  const headers = { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` };

  const ask = async () => {
    if (!description.trim()) return;
    setPhase("loading");
    setError("");
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/guide`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ description }),
      });
      const data = await res.json() as { suggestions?: Suggestion[]; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? `HTTP ${res.status}`);
      setSuggestions(data.suggestions ?? []);
      setPhase("results");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Viga");
      setPhase("error");
    }
  };

  const addSuggestion = (s: Suggestion) => {
    if (added.has(s.id) || selected.some((a) => a.id === s.id)) return;
    onAdd([...selected, {
      id: s.id,
      title: s.title,
      lyhend: s.lyhend,
      rt_url: `https://www.riigiteataja.ee/akt/${s.id}`,
      ministry: s.ministry,
    }]);
    setAdded((prev) => new Set([...prev, s.id]));
  };

  const addAll = () => {
    const toAdd = suggestions.filter(
      (s) => !added.has(s.id) && !selected.some((a) => a.id === s.id)
    );
    if (!toAdd.length) return;
    onAdd([
      ...selected,
      ...toAdd.map((s) => ({
        id: s.id,
        title: s.title,
        lyhend: s.lyhend,
        rt_url: `https://www.riigiteataja.ee/akt/${s.id}`,
        ministry: s.ministry,
      })),
    ]);
    setAdded((prev) => new Set([...prev, ...toAdd.map((s) => s.id)]));
  };

  const reset = () => {
    setPhase("input");
    setSuggestions([]);
    setAdded(new Set());
    setError("");
  };

  // ── Intro ──────────────────────────────────────────────────────────────────
  if (phase === "intro") {
    return (
      <div className="flex flex-col gap-3">
        <div className="rounded-md border border-neutral-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500">Abiline</p>
          <p className="mt-2 text-sm text-neutral-800">
            Ei tea, milliste seadustega võrdlema peaks? Kirjelda oma eelnõud paaril lausel — teen ettepaneku, milliseid akte analüüsida.
          </p>
          <button
            onClick={() => setPhase("input")}
            className="mt-3 w-full rounded-md bg-black py-2 text-xs font-medium text-white hover:bg-neutral-800"
          >
            Alusta juhendamisega →
          </button>
        </div>
        <div className="rounded-md border border-neutral-200 bg-white p-4 text-xs text-neutral-500">
          <p className="font-medium text-neutral-700">Kuidas see töötab</p>
          <ol className="mt-2 space-y-1.5 text-neutral-500">
            <li>1. Vali seadus(ed), millega eelnõu kokku puutub</li>
            <li>2. Otsi Riigikogust eelnõu või kleebi tekst</li>
            <li>3. Süsteem fetchib aktid RT-st ja analüüsib mõju</li>
          </ol>
        </div>
      </div>
    );
  }

  // ── Input ──────────────────────────────────────────────────────────────────
  if (phase === "input") {
    return (
      <div className="flex flex-col gap-3">
        <div className="rounded-md border border-neutral-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500">Abiline</p>
          <p className="mt-2 text-sm text-neutral-800">
            Kirjelda lühidalt, mida eelnõu teeb. Mida täpsemalt, seda paremad soovitused.
          </p>
          <textarea
            autoFocus
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="nt: Eelnõu muudab töölepinguseadust — lühendab katseaega ja lisab teavitamiskohustuse…"
            className="mt-3 w-full resize-none rounded border border-neutral-200 p-2.5 text-xs text-neutral-800 placeholder-neutral-400 focus:border-neutral-400 focus:outline-none"
          />
          <div className="mt-2 flex flex-wrap gap-1">
            {EXAMPLES.map((ex, i) => (
              <button
                key={i}
                onClick={() => setDescription(ex)}
                className="rounded bg-neutral-100 px-2 py-0.5 text-[10px] text-neutral-500 hover:bg-neutral-200"
              >
                näide {i + 1}
              </button>
            ))}
          </div>
          <button
            onClick={ask}
            disabled={description.trim().length < 20}
            className="mt-3 w-full rounded-md bg-black py-2 text-xs font-medium text-white hover:bg-neutral-800 disabled:bg-neutral-300"
          >
            Soovita akte →
          </button>
        </div>
      </div>
    );
  }

  // ── Loading ────────────────────────────────────────────────────────────────
  if (phase === "loading") {
    return (
      <div className="rounded-md border border-neutral-200 bg-white p-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500">Abiline</p>
        <div className="mt-3 flex items-center gap-2 text-xs text-neutral-500">
          <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-neutral-300 border-t-black" />
          Otsin seoseid aktide kataloogist…
        </div>
      </div>
    );
  }

  // ── Error ──────────────────────────────────────────────────────────────────
  if (phase === "error") {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 p-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-red-500">Viga</p>
        <p className="mt-1 text-xs text-red-700">{error}</p>
        <button onClick={reset} className="mt-2 text-xs text-red-600 underline">
          Proovi uuesti
        </button>
      </div>
    );
  }

  // ── Results ────────────────────────────────────────────────────────────────
  const allAdded = suggestions.every(
    (s) => added.has(s.id) || selected.some((a) => a.id === s.id)
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="rounded-md border border-neutral-200 bg-white p-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500">Abiline</p>
        <p className="mt-1.5 text-xs text-neutral-600">
          Sinu kirjelduse põhjal soovitan kontrollida järgmisi akte:
        </p>
      </div>

      <div className="space-y-1.5">
        {suggestions.map((s) => {
          const isAdded = added.has(s.id) || selected.some((a) => a.id === s.id);
          return (
            <div
              key={s.id}
              className={`rounded-md border p-3 ${URGENCY_STYLE[s.urgency] ?? "border-neutral-200 bg-white"}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="rounded bg-black/10 px-1.5 py-0.5 font-mono text-[10px] font-medium">
                      {URGENCY_LABEL[s.urgency]}
                    </span>
                    {s.lyhend && (
                      <span className="font-mono text-[10px] text-neutral-500">{s.lyhend}</span>
                    )}
                  </div>
                  <p className="mt-1 text-xs font-medium leading-snug text-neutral-900">{s.title}</p>
                  <p className="mt-0.5 text-[11px] text-neutral-500">{s.reason}</p>
                </div>
                <button
                  onClick={() => addSuggestion(s)}
                  disabled={isAdded}
                  className={`shrink-0 rounded px-2 py-1 text-[11px] font-medium transition-colors ${
                    isAdded
                      ? "bg-neutral-100 text-neutral-400 cursor-default"
                      : "bg-black text-white hover:bg-neutral-800"
                  }`}
                >
                  {isAdded ? "Lisatud ✓" : "Lisa"}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex gap-2">
        {!allAdded && (
          <button
            onClick={addAll}
            className="flex-1 rounded-md bg-black py-2 text-xs font-medium text-white hover:bg-neutral-800"
          >
            Lisa kõik soovitused
          </button>
        )}
        <button
          onClick={reset}
          className="rounded-md border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-500 hover:bg-neutral-50"
        >
          ↺ Küsi uuesti
        </button>
      </div>
    </div>
  );
}
