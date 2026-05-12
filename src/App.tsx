import { useState, useRef } from "react";
import { ActSearch } from "./components/ActSearch";
import { ActGuide } from "./components/ActGuide";
import { DraftSelector } from "./components/DraftSelector";
import { ChangeInput } from "./components/ChangeInput";
import { AutoActFinder } from "./components/AutoActFinder";
import { ImpactOutput } from "./components/ImpactOutput";
import { OnboardingOverlay } from "./components/OnboardingOverlay";
import { Tooltip } from "./components/Tooltip";
import type { ImpactAnalysis } from "./types";
import {
  getExcludedActs,
  recordExclusion,
  clearExclusion,
  clearAllExclusions,
  type ExcludedAct,
} from "./lib/feedback";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
// Set VITE_HYBRID_ENABLED=true after running ingest-chunks.ts + embed-chunks.ts
const HYBRID_ENABLED = import.meta.env.VITE_HYBRID_ENABLED === "true";
// Set VITE_AGENTIC_ENABLED=true after setting GROQ_API_KEY in Supabase secrets
const AGENTIC_ENABLED = import.meta.env.VITE_AGENTIC_ENABLED === "true";
const ONBOARDING_KEY = "rt-impact-onboarding-v2-seen";

interface Act {
  id: string;
  title: string;
  lyhend: string;
  rt_url: string;
  ministry: string;
}

type Mode = "auto" | "advanced";
type AutoStep = 1 | 2 | 3;
type AdvStep = 1 | 2 | 3;

const DEMO_ANALYSIS: ImpactAnalysis = {
  mode: "deterministic",
  affected_acts: [{
    act_title: "Haldusmenetluse seadus (näidis)",
    rt_identifier: "RT I 2001, 58, 354",
    reason: "Eelnõu lühendab taotluse esitamise tähtaega. See mõjutab kõiki haldusmenetluse akte, mis viitavad standardsetele tähtaegadele.",
    paragraphs: ["§ 14", "§ 36"],
    ministry: "Justiitsministeerium",
    impact_type: "amendment_required",
    confidence: 0.72,
    rt_url: "https://www.riigiteataja.ee",
    confirmed: null,
    keyword_hits: ["tähtaeg", "taotlus", "menetlus"],
    risk_score: 18,
  }],
  conflicts_found: [],
  ministries_to_notify: ["Justiitsministeerium"],
  unresolved: "",
  generated_at: new Date().toISOString(),
  acts_analysed: ["Haldusmenetluse seadus (näidis)"],
  paragraphs_retrieved: 12,
  prompt_preview: "See on näidisanalüüs.",
  estimated_input_tokens: 1200,
  estimated_cost_usd: 0.0008,
  ai_available: false,
};

const DEMO_ACTS: Act[] = [{
  id: "demo",
  title: "Haldusmenetluse seadus (näidis)",
  lyhend: "HMS",
  rt_url: "https://www.riigiteataja.ee",
  ministry: "Justiitsministeerium",
}];

export default function App() {
  const [mode, setMode] = useState<Mode>("auto");
  const [autoStep, setAutoStep] = useState<AutoStep>(1);
  const [advStep, setAdvStep] = useState<AdvStep>(1);

  // Auto mode state
  const [changeText, setChangeText] = useState("");
  const [changeTitle, setChangeTitle] = useState("");

  // Advanced mode state
  const [selectedActs, setSelectedActs] = useState<Act[]>([]);
  const [draftText, setDraftText] = useState("");

  // Feedback memory
  const [excludedActs, setExcludedActs] = useState<ExcludedAct[]>(() => getExcludedActs());

  // Shared
  const [analysis, setAnalysis] = useState<ImpactAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(() => !localStorage.getItem(ONBOARDING_KEY));
  const lastDraftRef = useRef<string>("");
  const lastActsRef = useRef<Act[]>([]);

  const dismissOnboarding = () => {
    localStorage.setItem(ONBOARDING_KEY, "1");
    setShowOnboarding(false);
  };

  const showDemo = () => {
    dismissOnboarding();
    setSelectedActs(DEMO_ACTS);
    setAnalysis(DEMO_ANALYSIS);
    setMode("advanced");
    setAdvStep(3);
  };

  const applyExclusions = (result: ImpactAnalysis): ImpactAnalysis => {
    const excluded = getExcludedActs();
    if (excluded.length === 0) return result;
    const excludedIds = new Set(excluded.map((e) => e.rt_identifier));
    return {
      ...result,
      affected_acts: result.affected_acts.map((a) =>
        excludedIds.has(a.rt_identifier) ? { ...a, confirmed: false } : a
      ),
    };
  };

  const callAnalyse = async (draft: string, acts: Act[], analysisMode: "deterministic" | "ai" | "hybrid" | "agentic", draftTitle?: string) => {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/analyse`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        draft,
        title: draftTitle,
        acts: acts.map((a) => ({ id: a.id, title: a.title, lyhend: a.lyhend })),
        mode: analysisMode,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`);
    }
    return res.json() as Promise<ImpactAnalysis>;
  };

  // Hybrid mode: skip act selection, backend does semantic search in vector DB
  const handleHybridAnalysis = async (text: string, title: string) => {
    lastDraftRef.current = text;
    lastActsRef.current = [];
    setChangeText(text);
    setChangeTitle(title);
    setLoading(true);
    setError(null);
    setAutoStep(3);
    try {
      const result = await callAnalyse(text, [], "hybrid", title);
      setAnalysis(applyExclusions(result));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Tundmatu viga");
    } finally {
      setLoading(false);
    }
  };

  // Agentic mode: hybrid RAG + Groq Llama 3 tool calling
  const handleAgenticAnalysis = async (text: string, title: string) => {
    lastDraftRef.current = text;
    lastActsRef.current = [];
    setChangeText(text);
    setChangeTitle(title);
    setLoading(true);
    setError(null);
    setAutoStep(3);
    try {
      const result = await callAnalyse(text, [], "agentic", title);
      setAnalysis(applyExclusions(result));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Tundmatu viga");
    } finally {
      setLoading(false);
    }
  };

  // Auto mode: called from AutoActFinder with the auto-selected acts
  const handleAutoAnalyse = async (acts: Act[]) => {
    lastDraftRef.current = changeText;
    lastActsRef.current = acts;
    setLoading(true);
    setError(null);
    try {
      const result = await callAnalyse(changeText, acts, "deterministic");
      setAnalysis(applyExclusions(result));
      setAutoStep(3);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Tundmatu viga");
    } finally {
      setLoading(false);
    }
  };

  // Advanced mode: called from DraftSelector
  const handleAdvancedAnalyse = async (text: string, _title?: string) => {
    lastDraftRef.current = text;
    lastActsRef.current = selectedActs;
    setLoading(true);
    setError(null);
    try {
      const result = await callAnalyse(text, selectedActs, "deterministic");
      setAnalysis(applyExclusions(result));
      setAdvStep(3);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Tundmatu viga");
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateReport = async (): Promise<string> => {
    if (!analysis) throw new Error("Analüüs puudub");
    const res = await fetch(`${SUPABASE_URL}/functions/v1/analyse`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        mode: "impact_report",
        draft: changeText,
        title: changeTitle,
        affected_acts: analysis.affected_acts.filter((a) => a.confirmed !== false),
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`);
    }
    const data = await res.json() as { report: string };
    return data.report;
  };

  const handleConfirm = (idx: number) =>
    setAnalysis((prev) =>
      prev ? { ...prev, affected_acts: prev.affected_acts.map((a, i) => i === idx ? { ...a, confirmed: true } : a) } : null
    );

  const handleFlag = (idx: number) => {
    const act = analysis?.affected_acts[idx];
    if (act) setExcludedActs(recordExclusion(act.rt_identifier, act.act_title));
    setAnalysis((prev) =>
      prev ? { ...prev, affected_acts: prev.affected_acts.map((a, i) => i === idx ? { ...a, confirmed: false } : a) } : null
    );
  };

  const handleClearExclusion = (rt_identifier: string) => {
    setExcludedActs(clearExclusion(rt_identifier));
    setAnalysis((prev) =>
      prev ? { ...prev, affected_acts: prev.affected_acts.map((a) =>
        a.rt_identifier === rt_identifier ? { ...a, confirmed: null } : a
      )} : null
    );
  };

  const handleClearAllExclusions = () => {
    clearAllExclusions();
    setExcludedActs([]);
    setAnalysis((prev) =>
      prev ? { ...prev, affected_acts: prev.affected_acts.map((a) =>
        a.confirmed === false ? { ...a, confirmed: null } : a
      )} : null
    );
  };

  const resetAll = () => {
    setAnalysis(null);
    setError(null);
    setChangeText("");
    setChangeTitle("");
    setSelectedActs([]);
    setDraftText("");
    lastDraftRef.current = "";
    lastActsRef.current = [];
    setAutoStep(1);
    setAdvStep(1);
  };

  const switchMode = (m: Mode) => {
    setMode(m);
    setAnalysis(null);
    setError(null);
  };

  // Step labels per mode
  const AUTO_STEPS = [
    { n: 1 as AutoStep, label: "Lisa muudatus" },
    { n: 2 as AutoStep, label: "Leia mõjutatud aktid" },
    { n: 3 as AutoStep, label: "Kontrolli tulemused" },
  ];
  const ADV_STEPS = [
    { n: 1 as AdvStep, label: "Vali õigusakt" },
    { n: 2 as AdvStep, label: "Lisa võrreldav tekst" },
    { n: 3 as AdvStep, label: "Kontrolli tulemused" },
  ];

  const currentStep = mode === "auto" ? autoStep : advStep;
  const steps = mode === "auto" ? AUTO_STEPS : ADV_STEPS;

  return (
    <div className="flex h-screen flex-col bg-neutral-50">

      {showOnboarding && (
        <OnboardingOverlay onDismiss={dismissOnboarding} onDemo={showDemo} />
      )}

      {/* Header */}
      <header className="border-b border-neutral-200 bg-white px-6 py-3">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="flex items-baseline gap-3">
            <a
              href="https://kadrikungla.dev"
              className="font-mono text-lg font-bold tracking-tight text-black hover:text-neutral-600 transition-colors"
            >
              rt-impact
            </a>
            <span className="text-sm text-neutral-400">Võimaliku mõju kontroll</span>
          </div>

          <div className="flex items-center gap-3">
            {/* Mode toggle */}
            <div className="flex items-center gap-1 rounded-md border border-neutral-200 bg-neutral-100 p-0.5">
              <button
                onClick={() => switchMode("auto")}
                className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
                  mode === "auto" ? "bg-white text-black shadow-sm" : "text-neutral-500 hover:text-neutral-700"
                }`}
              >
                Agentne kontroll
              </button>
              <button
                onClick={() => switchMode("advanced")}
                className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
                  mode === "advanced" ? "bg-white text-black shadow-sm" : "text-neutral-500 hover:text-neutral-700"
                }`}
              >
                Käsitsi valimine
              </button>
            </div>

            {/* Step indicator */}
            <div className="flex items-center gap-1">
              {steps.map((s, i) => (
                <div key={s.n} className="flex items-center gap-1">
                  <button
                    onClick={() => {
                      if (s.n < currentStep) {
                        mode === "auto" ? setAutoStep(s.n) : setAdvStep(s.n);
                      }
                    }}
                    className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-xs transition-colors ${
                      currentStep === s.n
                        ? "bg-black text-white"
                        : s.n < currentStep
                        ? "cursor-pointer text-neutral-500 hover:text-black"
                        : "cursor-default text-neutral-300"
                    }`}
                  >
                    <span className="font-mono">{String(s.n).padStart(2, "0")}</span>
                    <span>{s.label}</span>
                  </button>
                  {i < steps.length - 1 && <span className="text-neutral-300">›</span>}
                </div>
              ))}
            </div>

            <button
              onClick={() => setShowOnboarding(true)}
              className="rounded border border-neutral-200 px-2 py-1 text-[11px] text-neutral-500 hover:bg-neutral-50"
            >
              ? Juhend
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-7xl flex-1 overflow-hidden p-6">

        {/* ─────────── AUTO MODE ─────────── */}

        {mode === "auto" && autoStep === 1 && (
          <div className="flex w-full gap-6">
            <div className="flex flex-1 flex-col overflow-hidden gap-3">
              <div className="rounded-md border border-neutral-200 bg-white px-4 py-3">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-neutral-700">01 — Lisa muudatus</span>
                  <Tooltip text="Kirjelda kavandatavat muudatust nii täpselt kui võimalik. Mida konkreetsem sisend, seda täpsemad tulemused." />
                </div>
              </div>
              <div className="flex-1 overflow-hidden">
                <ChangeInput
                  supabaseUrl={SUPABASE_URL}
                  supabaseKey={SUPABASE_ANON_KEY}
                  onTextChange={setChangeText}
                  hybridEnabled={HYBRID_ENABLED}
                  onDirectAnalysis={handleHybridAnalysis}
                  agenticEnabled={AGENTIC_ENABLED}
                  onAgenticAnalysis={handleAgenticAnalysis}
                  onReady={(text, title) => {
                    setChangeText(text);
                    setChangeTitle(title);
                    setAutoStep(2);
                  }}
                />
              </div>
            </div>

            <div className="w-72 shrink-0 flex flex-col gap-3 pt-11">
              <div className="rounded-md border border-neutral-200 bg-white p-3 text-xs text-neutral-600 space-y-2">
                <p className="font-medium text-neutral-700">Mida kasutada sisendina?</p>
                <p className="text-neutral-500 leading-relaxed">
                  Tööriist töötab kõige paremini, kui kirjeldad konkreetset muudatust — mitte üldist ideed.
                </p>
                <p className="font-medium text-neutral-600">Võimalikud mõju tüübid:</p>
                <ul className="space-y-1 text-neutral-500">
                  {[
                    "Õigused ja kohustused",
                    "Tähtajad",
                    "Menetlus",
                    "Andmed ja registrid",
                    "Järelevalve",
                    "Rahaline mõju",
                    "Asutuse töökorraldus",
                    "Kohaliku omavalitsuse ülesanded",
                  ].map((t) => (
                    <li key={t} className="flex gap-1.5">
                      <span className="text-neutral-300">·</span>
                      {t}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-md border border-amber-100 bg-amber-50 px-3 py-2.5 text-[11px] text-amber-800 leading-relaxed">
                Tulemus ei ole lõplik õiguslik hinnang. See näitab, milliseid akte võib inimene edasi kontrollida.
              </div>
            </div>
          </div>
        )}

        {mode === "auto" && autoStep === 2 && (
          <div className="flex w-full gap-6">
            <div className="flex flex-1 flex-col overflow-hidden gap-3">
              <div className="rounded-md border border-neutral-200 bg-white px-4 py-3">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-neutral-700">02 — Tuvastatud võimalikult mõjutatud õigusaktid</span>
                  <Tooltip text="Tuvastus põhineb märksõnalisel vastavusel. Süsteem kontrollis kataloogi ja valis automaatselt kõige tõenäolisemalt seotud aktid. Saad valikut muuta." />
                </div>
                <p className="mt-0.5 text-xs text-neutral-500">
                  Vali aktid, mida soovid analüüsida, ja käivita kontroll.
                </p>
              </div>
              <div className="flex-1 overflow-y-auto">
                <AutoActFinder
                  changeText={changeText}
                  supabaseUrl={SUPABASE_URL}
                  supabaseKey={SUPABASE_ANON_KEY}
                  onAnalyse={handleAutoAnalyse}
                  loading={loading}
                />
              </div>
            </div>

            <div className="w-72 shrink-0 flex flex-col gap-3">
              <div className="rounded-md border border-neutral-200 bg-white px-3 py-2.5">
                <p className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wide mb-1.5">Sinu muudatus</p>
                <p className="text-xs text-neutral-700 leading-relaxed line-clamp-6">{changeText}</p>
                <button
                  onClick={() => setAutoStep(1)}
                  className="mt-2 text-[11px] text-neutral-400 underline hover:text-neutral-700"
                >
                  ← Muuda sisestust
                </button>
              </div>
              {error && (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                  {error}
                </div>
              )}
              <div className="rounded-md border border-blue-100 bg-blue-50 px-3 py-2.5 text-[11px] text-blue-800 leading-relaxed">
                <p className="font-medium mb-1">Mis juhtub pärast?</p>
                <p>Tööriist kontrollib valitud aktide paragrahve sinu muudatuse vastu ja näitab, kus tekstiline kattuvus on kõige suurem.</p>
              </div>
            </div>
          </div>
        )}

        {mode === "auto" && autoStep === 3 && (
          <div className="flex w-full gap-6 overflow-hidden">
            <div className="w-72 shrink-0 flex flex-col gap-4">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-widest text-neutral-500">
                  Muudatus
                </h3>
                <div className="mt-2 rounded-md border border-neutral-200 bg-white px-3 py-2.5">
                  <p className="text-xs text-neutral-700 leading-relaxed line-clamp-5">{changeText || changeTitle}</p>
                </div>
              </div>
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-widest text-neutral-500">
                  Kontrollitud aktid
                </h3>
                <div className="mt-2 space-y-1.5">
                  {lastActsRef.current.map((a) => (
                    <div key={a.id} className="rounded-md border border-neutral-200 bg-white px-3 py-2">
                      <p className="text-xs font-medium text-neutral-900">{a.title}</p>
                      {a.lyhend && <p className="mt-0.5 font-mono text-[11px] text-neutral-400">{a.lyhend}</p>}
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-md border border-neutral-200 bg-white p-3 text-xs text-neutral-600">
                <p className="font-medium text-neutral-700 mb-1.5">Kuidas tulemusi üle vaadata?</p>
                <ol className="space-y-1.5 text-neutral-500">
                  <li>1. Loe iga leitud seos läbi</li>
                  <li>2. Klõpsa „Miks see leiti?" et näha põhjust</li>
                  <li>3. Märgi olulised kinnitatuks</li>
                  <li>4. Märgi ebaolulised ebaoluliseks</li>
                </ol>
              </div>
              <button
                onClick={resetAll}
                className="w-full rounded-md border border-neutral-200 bg-white py-2 text-xs text-neutral-600 hover:bg-neutral-50"
              >
                ← Alusta uut kontrolli
              </button>
            </div>
            <div className="flex flex-1 flex-col overflow-y-auto">
              <ImpactOutput
                analysis={analysis}
                loading={loading}
                error={error}
                onConfirm={handleConfirm}
                onFlag={handleFlag}

                excludedActs={excludedActs}
                onClearExclusion={handleClearExclusion}
                onClearAllExclusions={handleClearAllExclusions}
                onGenerateReport={handleGenerateReport}
              />
            </div>
          </div>
        )}

        {/* ─────────── ADVANCED MODE ─────────── */}

        {mode === "advanced" && advStep === 1 && (
          <div className="flex w-full gap-6">
            <div className="flex flex-1 flex-col overflow-hidden gap-3">
              <div className="rounded-md border border-neutral-200 bg-white px-4 py-3">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-neutral-700">01 — Vali kehtiv õigusakt</span>
                  <Tooltip text="Kehtiv õigusakt on praegu kehtiv seadus või määrus Riigi Teatajast. Otsi akt, mida soovid kontrollida." />
                </div>
                <p className="mt-1 text-xs text-neutral-500">
                  Otsi seadus või määrus, millega sinu tekst võib kokku puutuda.
                </p>
                <div className="mt-2 flex flex-wrap gap-3 text-[11px]">
                  <span className="text-green-600">✓ kehtiv seadus Riigi Teatajast</span>
                  <span className="text-green-600">✓ kehtiv määrus Riigi Teatajast</span>
                  <span className="text-neutral-400">✗ uudisartikkel</span>
                  <span className="text-neutral-400">✗ arvamuslugu</span>
                </div>
              </div>
              <div className="flex-1 overflow-hidden">
                <ActSearch
                  selected={selectedActs}
                  onSelectionChange={setSelectedActs}
                  supabaseUrl={SUPABASE_URL}
                  supabaseKey={SUPABASE_ANON_KEY}
                  draftText={draftText}
                />
              </div>
            </div>

            <div className="flex w-72 shrink-0 flex-col gap-3">
              <div className="flex-1 overflow-y-auto">
                <ActGuide
                  supabaseUrl={SUPABASE_URL}
                  supabaseKey={SUPABASE_ANON_KEY}
                  selected={selectedActs}
                  onAdd={setSelectedActs}
                />
              </div>
              <button
                onClick={() => setAdvStep(2)}
                disabled={selectedActs.length === 0}
                className="w-full rounded-md bg-black py-2.5 text-sm font-medium text-white transition-colors hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-300"
              >
                Edasi: lisa võrreldav tekst →
              </button>
              {selectedActs.length === 0 && (
                <p className="text-center text-xs text-neutral-400">Vali vähemalt üks õigusakt</p>
              )}
            </div>
          </div>
        )}

        {mode === "advanced" && advStep === 2 && (
          <div className="flex w-full gap-6">
            <div className="flex flex-1 flex-col overflow-hidden gap-3">
              <div className="rounded-md border border-neutral-200 bg-white px-4 py-3">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-neutral-700">02 — Lisa võrreldav tekst</span>
                  <Tooltip text="Võrreldav tekst on see, mida soovid kehtiva aktiga võrrelda — eelnõu, muudatusettepanek, seletuskiri vms." />
                </div>
                <div className="mt-2 flex flex-wrap gap-3 text-[11px]">
                  <span className="text-green-600">✓ seaduseelnõu tekst</span>
                  <span className="text-green-600">✓ seletuskirja lõik</span>
                  <span className="text-green-600">✓ määruse muudatus</span>
                  <span className="text-neutral-400">✗ liiga üldine idee</span>
                </div>
              </div>
              <div className="flex-1 overflow-hidden">
                <DraftSelector
                  supabaseUrl={SUPABASE_URL}
                  supabaseKey={SUPABASE_ANON_KEY}
                  loading={loading}
                  selectedActTitles={selectedActs.map((a) => a.title)}
                  onDraftReady={handleAdvancedAnalyse}
                />
              </div>
            </div>

            <div className="flex w-72 shrink-0 flex-col gap-4">
              <div>
                <div className="flex items-center gap-1.5">
                  <h3 className="text-xs font-semibold uppercase tracking-widest text-neutral-500">Valitud aktid</h3>
                  <Tooltip text="Need on kehtivad aktid, mida analüüsid." />
                </div>
                <div className="mt-2 space-y-2">
                  {selectedActs.map((a) => (
                    <div key={a.id} className="rounded-md border border-neutral-200 bg-white px-3 py-2">
                      <p className="text-sm font-medium text-neutral-900">{a.title}</p>
                      {a.lyhend && (
                        <p className="mt-0.5 font-mono text-[11px] text-neutral-400">{a.lyhend}</p>
                      )}
                    </div>
                  ))}
                </div>
                <button onClick={() => setAdvStep(1)} className="mt-2 text-xs text-neutral-400 underline hover:text-neutral-700">
                  ← Muuda valikut
                </button>
              </div>
              {error && (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                  {error}
                </div>
              )}
            </div>
          </div>
        )}

        {mode === "advanced" && advStep === 3 && (
          <div className="flex w-full gap-6 overflow-hidden">
            <div className="w-72 shrink-0 flex flex-col gap-4">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-widest text-neutral-500">
                  Analüüsitud aktid
                </h3>
                <div className="mt-2 space-y-2">
                  {selectedActs.map((a) => (
                    <div key={a.id} className="rounded-md border border-neutral-200 bg-white px-3 py-2">
                      <p className="text-sm font-medium text-neutral-900">{a.title}</p>
                      <a
                        href={a.rt_url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-0.5 block font-mono text-[11px] text-neutral-400 underline hover:text-neutral-700"
                      >
                        Ava Riigi Teatajas →
                      </a>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-md border border-neutral-200 bg-white p-3 text-xs text-neutral-600">
                <p className="font-medium text-neutral-700 mb-1.5">Kuidas tulemusi üle vaadata?</p>
                <ol className="space-y-1.5 text-neutral-500">
                  <li>1. Loe iga leitud seos läbi</li>
                  <li>2. Klõpsa „Miks see leiti?"</li>
                  <li>3. Märgi oma hinnang</li>
                </ol>
                <p className="mt-2 text-[11px] text-neutral-400 leading-relaxed">
                  Kõik tulemused on soovituslikud.
                </p>
              </div>
              <button
                onClick={resetAll}
                className="w-full rounded-md border border-neutral-200 bg-white py-2 text-xs text-neutral-600 hover:bg-neutral-50"
              >
                ← Alusta uut kontrolli
              </button>
            </div>
            <div className="flex flex-1 flex-col overflow-y-auto">
              <ImpactOutput
                analysis={analysis}
                loading={loading}
                error={error}
                onConfirm={handleConfirm}
                onFlag={handleFlag}

                excludedActs={excludedActs}
                onClearExclusion={handleClearExclusion}
                onClearAllExclusions={handleClearAllExclusions}
                onGenerateReport={handleGenerateReport}
              />
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
