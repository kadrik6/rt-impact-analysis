import { useState, useEffect, useRef } from "react";

interface Draft {
  uuid: string;
  title: string;
  mark: number;
  draftTypeLabel: string;
  stage: string;
  leadingCommittee: string | null;
  initiated: string;
  riigikoguUrl: string;
}

interface FetchedDraft {
  uuid: string;
  title: string;
  introduction: string;
  keywords: string[];
  text: string;
  textSource: "full_pdf" | "introduction";
  hasPdf: boolean;
  pdfError: string | null;
  riigikoguUrl: string;
}

interface Props {
  supabaseUrl: string;
  supabaseKey: string;
  onReady: (text: string, title: string) => void;
  onTextChange?: (text: string) => void;
  hybridEnabled?: boolean;
  onDirectAnalysis?: (text: string, title: string) => void;
  agenticEnabled?: boolean;
  onAgenticAnalysis?: (text: string, title: string) => void;
}

type Tab = "paste" | "search";

const DRAFT_TYPES = [
  { value: "", label: "Kõik tüübid" },
  { value: "SE", label: "Seaduseelnõu" },
  { value: "OE", label: "Otsuse eelnõu" },
];
const STATUSES = [
  { value: "IN_PROCESS", label: "Menetluses" },
  { value: "FINISHED", label: "Lõpetatud" },
  { value: "", label: "Kõik" },
];

const GOOD_EXAMPLES = [
  "Lühendame taotluse esitamise tähtaega 30 päevalt 15 päevale.",
  "Lisame kohustuse esitada andmed uude registrisse.",
  "Muudame toetuse andmise tingimusi.",
  "Anname ametile õiguse teha täiendavat järelevalvet.",
  "Vähendame aruandluskohustust väikestele ettevõtjatele.",
];

const BAD_EXAMPLES = [
  "Tee süsteem paremaks.",
  "Muudame seadust kaasaegsemaks.",
  "Vähendame bürokraatiat.",
];

export function ChangeInput({ supabaseUrl, supabaseKey, onReady, onTextChange, hybridEnabled, onDirectAnalysis, agenticEnabled, onAgenticAnalysis }: Props) {
  const [tab, setTab] = useState<Tab>("paste");
  const [pasteText, setPasteText] = useState("");
  const [showExamples, setShowExamples] = useState(false);

  const [query, setQuery] = useState("");
  const [draftType, setDraftType] = useState("SE");
  const [status, setStatus] = useState("IN_PROCESS");
  const [results, setResults] = useState<Draft[]>([]);
  const [searching, setSearching] = useState(false);
  const [preview, setPreview] = useState<FetchedDraft | null>(null);
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [loadingPdf, setLoadingPdf] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const headers = { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` };

  const search = async (q: string, type: string, st: string) => {
    setSearching(true);
    try {
      const params = new URLSearchParams({ size: "30" });
      if (q) params.set("q", q);
      if (type) params.set("type", type);
      if (st) params.set("status", st);
      const res = await fetch(`${supabaseUrl}/functions/v1/list-drafts?${params}`, { headers });
      if (!res.ok) throw new Error(`${res.status}`);
      setResults(await res.json());
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(query, draftType, status), 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, draftType, status]);

  useEffect(() => { search("", "SE", "IN_PROCESS"); }, []);

  const loadPreview = async (draft: Draft) => {
    setPreview(null);
    setFetchError(null);
    setFetching(true);
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/fetch-draft?uuid=${draft.uuid}`, { headers });
      const data = await res.json() as FetchedDraft & { error?: string };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setPreview(data);
      onTextChange?.(data.text);
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : "Viga eelnõu laadimisel");
    } finally {
      setFetching(false);
    }
  };

  const loadFullPdf = async () => {
    if (!preview) return;
    setLoadingPdf(true);
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/fetch-draft?uuid=${preview.uuid}&full=true`, { headers });
      const data = await res.json() as FetchedDraft & { error?: string };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setPreview(data);
      onTextChange?.(data.text);
    } catch (e) {
      setPreview((p) => p ? { ...p, pdfError: e instanceof Error ? e.message : "Viga" } : p);
    } finally {
      setLoadingPdf(false);
    }
  };

  const handlePasteChange = (v: string) => {
    setPasteText(v);
    onTextChange?.(v);
  };

  return (
    <div className="flex h-full flex-col gap-3">
      {/* Description */}
      <div className="rounded-md border border-blue-100 bg-blue-50 px-4 py-3 text-xs text-blue-800 leading-relaxed">
        Muudatus võib olla eelnõu, muudatusettepanek, seletuskirja lõik, poliitikameede või
        lihtsas keeles kirjeldatud plaan. Tööriist otsib, milliseid kehtivaid õigusakte see võib puudutada.
      </div>

      {/* Tab toggle */}
      <div className="flex gap-1 rounded-md border border-neutral-200 bg-neutral-100 p-1">
        {(["paste", "search"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 rounded py-1.5 text-xs font-medium transition-colors ${
              tab === t ? "bg-white text-black shadow-sm" : "text-neutral-500 hover:text-neutral-700"
            }`}
          >
            {t === "paste" ? "Kirjuta muudatus" : "Otsi Riigikogust"}
          </button>
        ))}
      </div>

      {tab === "paste" && (
        <div className="flex flex-1 flex-col gap-2">
          <textarea
            placeholder="Kirjuta siia muudatus, mille mõju soovid kontrollida..."
            value={pasteText}
            onChange={(e) => handlePasteChange(e.target.value)}
            className="flex-1 resize-none rounded-md border border-neutral-200 p-3 text-sm text-neutral-900 focus:border-neutral-400 focus:outline-none"
          />

          {/* Example toggle */}
          <button
            onClick={() => setShowExamples((v) => !v)}
            className="self-start text-xs text-neutral-400 underline underline-offset-2 hover:text-neutral-700"
          >
            {showExamples ? "Peida näited" : "Näita näiteid →"}
          </button>

          {showExamples && (
            <div className="rounded-md border border-neutral-100 bg-neutral-50 p-3 text-xs space-y-3">
              <div>
                <p className="font-medium text-neutral-600 mb-1.5">Sobivad sisendid:</p>
                <div className="space-y-1.5">
                  {GOOD_EXAMPLES.map((ex, i) => (
                    <button
                      key={i}
                      onClick={() => handlePasteChange(ex)}
                      className="flex w-full items-start gap-2 text-left text-neutral-700 hover:text-black"
                    >
                      <span className="shrink-0 text-green-500">✓</span>
                      <span className="underline underline-offset-2">{ex}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="font-medium text-neutral-500 mb-1.5">Liiga üldised — annab ebatäpseid tulemusi:</p>
                <ul className="space-y-1">
                  {BAD_EXAMPLES.map((ex, i) => (
                    <li key={i} className="flex gap-2 text-neutral-400">
                      <span className="shrink-0">✗</span>
                      <span>{ex}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {agenticEnabled ? (
            <div className="flex flex-col gap-2">
              <button
                onClick={() => onAgenticAnalysis?.(pasteText, "Sisestatud muudatus")}
                disabled={pasteText.trim().length < 30}
                className="w-full rounded-md bg-black py-2.5 text-sm font-medium text-white transition-colors hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-300"
              >
                Teosta täisanalüüs →
              </button>
              <p className="text-center text-[11px] text-neutral-400">
                Semantiline otsing · AI kontroll · dünaamiline andmepäring
              </p>
              <button
                onClick={() => onReady(pasteText, "Sisestatud muudatus")}
                disabled={pasteText.trim().length < 30}
                className="w-full rounded-md border border-neutral-300 py-2 text-xs text-neutral-600 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Vali aktid käsitsi →
              </button>
            </div>
          ) : hybridEnabled ? (
            <div className="flex flex-col gap-2">
              <button
                onClick={() => onDirectAnalysis?.(pasteText, "Sisestatud muudatus")}
                disabled={pasteText.trim().length < 30}
                className="w-full rounded-md bg-black py-2.5 text-sm font-medium text-white transition-colors hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-300"
              >
                Analüüsi kohe (semantiline otsing) →
              </button>
              <button
                onClick={() => onReady(pasteText, "Sisestatud muudatus")}
                disabled={pasteText.trim().length < 30}
                className="w-full rounded-md border border-neutral-300 py-2 text-xs text-neutral-600 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Vali aktid käsitsi →
              </button>
            </div>
          ) : (
            <button
              onClick={() => onReady(pasteText, "Sisestatud muudatus")}
              disabled={pasteText.trim().length < 30}
              className="w-full rounded-md bg-black py-2.5 text-sm font-medium text-white transition-colors hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-300"
            >
              Edasi: leia mõjutatud õigusaktid →
            </button>
          )}
          {pasteText.trim().length > 0 && pasteText.trim().length < 30 && (
            <p className="text-center text-xs text-neutral-400">Lisa vähemalt 30 tähemärki</p>
          )}
        </div>
      )}

      {tab === "search" && (
        <div className="flex flex-1 flex-col gap-2 overflow-hidden">
          <div className="flex gap-2">
            <input
              type="search"
              placeholder="Otsi eelnõu pealkirja järgi…"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setPreview(null); }}
              className="min-w-0 flex-1 rounded-md border border-neutral-200 px-3 py-2 text-sm focus:border-neutral-400 focus:outline-none"
            />
            <select
              value={draftType}
              onChange={(e) => setDraftType(e.target.value)}
              className="rounded-md border border-neutral-200 bg-white px-2 py-2 text-xs text-neutral-600 focus:outline-none"
            >
              {DRAFT_TYPES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="rounded-md border border-neutral-200 bg-white px-2 py-2 text-xs text-neutral-600 focus:outline-none"
            >
              {STATUSES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          {(fetching || preview || fetchError) && (
            <div className="rounded-md border border-neutral-200 bg-neutral-50 p-3">
              {fetching && (
                <div className="flex items-center gap-2 text-xs text-neutral-500">
                  <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-neutral-300 border-t-black" />
                  Laen eelnõu andmeid…
                </div>
              )}
              {fetchError && <p className="text-xs text-red-600">{fetchError}</p>}
              {preview && !fetching && (
                <div className="flex flex-col gap-2">
                  <div>
                    <p className="text-xs font-semibold text-neutral-800">{preview.title}</p>
                    {preview.keywords.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {preview.keywords.map((k) => (
                          <span key={k} className="rounded bg-neutral-200 px-1.5 py-0.5 text-[10px] text-neutral-600">{k}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  {preview.introduction && (
                    <p className="line-clamp-3 text-[11px] leading-relaxed text-neutral-600">
                      {preview.introduction}
                    </p>
                  )}
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] ${preview.textSource === "full_pdf" ? "text-green-600" : "text-neutral-400"}`}>
                      {preview.textSource === "full_pdf" ? "✓ Täistekst laetud" : "Kokkuvõte · sissejuhatus"}
                    </span>
                    {preview.hasPdf && preview.textSource !== "full_pdf" && (
                      <button
                        onClick={loadFullPdf}
                        disabled={loadingPdf}
                        className="text-[10px] text-neutral-500 underline hover:text-neutral-800 disabled:opacity-50"
                      >
                        {loadingPdf ? "Laen PDF…" : "Laadi täistekst (PDF)"}
                      </button>
                    )}
                    {preview.pdfError && (
                      <span className="text-[10px] text-amber-600">PDF kättesaamatu</span>
                    )}
                    <a
                      href={preview.riigikoguUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="ml-auto text-[10px] text-neutral-400 underline hover:text-neutral-700"
                    >
                      Ava Riigikogus →
                    </a>
                  </div>
                  {agenticEnabled ? (
                    <div className="flex flex-col gap-1.5">
                      <button
                        onClick={() => onAgenticAnalysis?.(preview.text, preview.title)}
                        className="w-full rounded-md bg-black py-2 text-xs font-medium text-white hover:bg-neutral-800"
                      >
                        Teosta täisanalüüs →
                      </button>
                      <p className="text-center text-[10px] text-neutral-400">
                        Semantiline otsing · AI kontroll · dünaamiline andmepäring
                      </p>
                      <button
                        onClick={() => onReady(preview.text, preview.title)}
                        className="w-full rounded-md border border-neutral-300 py-1.5 text-xs text-neutral-600 hover:bg-neutral-50"
                      >
                        Vali aktid käsitsi →
                      </button>
                    </div>
                  ) : hybridEnabled ? (
                    <div className="flex flex-col gap-1.5">
                      <button
                        onClick={() => onDirectAnalysis?.(preview.text, preview.title)}
                        className="w-full rounded-md bg-black py-2 text-xs font-medium text-white hover:bg-neutral-800"
                      >
                        Analüüsi kohe (semantiline otsing) →
                      </button>
                      <button
                        onClick={() => onReady(preview.text, preview.title)}
                        className="w-full rounded-md border border-neutral-300 py-1.5 text-xs text-neutral-600 hover:bg-neutral-50"
                      >
                        Vali aktid käsitsi →
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => onReady(preview.text, preview.title)}
                      className="w-full rounded-md bg-black py-2 text-xs font-medium text-white hover:bg-neutral-800"
                    >
                      Edasi: leia mõjutatud õigusaktid →
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="flex-1 overflow-y-auto rounded-md border border-neutral-200">
            {searching && (
              <div className="flex items-center justify-center py-8 text-xs text-neutral-400">
                Otsin Riigikogu menetlusest…
              </div>
            )}
            {!searching && results.length === 0 && (
              <div className="flex items-center justify-center py-8 text-xs text-neutral-400">
                Tulemused puuduvad
              </div>
            )}
            {!searching && results.map((draft) => (
              <button
                key={draft.uuid}
                onClick={() => loadPreview(draft)}
                className={`flex w-full flex-col gap-0.5 border-b border-neutral-100 px-4 py-3 text-left transition-colors last:border-0 hover:bg-neutral-50 ${
                  preview?.uuid === draft.uuid ? "bg-neutral-50 ring-1 ring-inset ring-neutral-300" : ""
                }`}
              >
                <span className="text-sm font-medium text-neutral-900">{draft.title}</span>
                <span className="flex items-center gap-2 text-[11px] text-neutral-400">
                  <span className="font-mono">{draft.mark} {draft.draftTypeLabel}</span>
                  <span>·</span>
                  <span>{draft.stage}</span>
                  {draft.leadingCommittee && (
                    <><span>·</span><span>{draft.leadingCommittee}</span></>
                  )}
                  <span>·</span>
                  <span>{draft.initiated}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
