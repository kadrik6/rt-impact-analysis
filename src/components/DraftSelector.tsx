import { useState, useEffect, useRef, useMemo } from "react";
import { scoreDraftVsActs } from "@/lib/relevance";

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
  onDraftReady: (text: string, title: string) => void;
  loading: boolean;
  selectedActTitles?: string[];
}

type Tab = "search" | "paste";

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

export function DraftSelector({ supabaseUrl, supabaseKey, onDraftReady, loading, selectedActTitles = [] }: Props) {
  const [tab, setTab] = useState<Tab>("search");

  const [query, setQuery] = useState("");
  const [draftType, setDraftType] = useState("SE");
  const [status, setStatus] = useState("IN_PROCESS");
  const [results, setResults] = useState<Draft[]>([]);
  const [searching, setSearching] = useState(false);

  const [preview, setPreview] = useState<FetchedDraft | null>(null);
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [loadingPdf, setLoadingPdf] = useState(false);

  const [pasteText, setPasteText] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const draftRelevance = useMemo(
    () => new Map(results.map((d) => [d.uuid, scoreDraftVsActs(d.title, selectedActTitles)])),
    [results, selectedActTitles]
  );

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
      const res = await fetch(
        `${supabaseUrl}/functions/v1/fetch-draft?uuid=${draft.uuid}`,
        { headers }
      );
      const data = await res.json() as FetchedDraft & { error?: string };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setPreview(data);
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
      const res = await fetch(
        `${supabaseUrl}/functions/v1/fetch-draft?uuid=${preview.uuid}&full=true`,
        { headers }
      );
      const data = await res.json() as FetchedDraft & { error?: string };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setPreview(data);
    } catch (e) {
      setPreview((p) => p ? { ...p, pdfError: e instanceof Error ? e.message : "Viga" } : p);
    } finally {
      setLoadingPdf(false);
    }
  };

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex gap-1 rounded-md border border-neutral-200 bg-neutral-100 p-1">
        {(["search", "paste"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 rounded py-1.5 text-xs font-medium transition-colors ${
              tab === t ? "bg-white text-black shadow-sm" : "text-neutral-500 hover:text-neutral-700"
            }`}
          >
            {t === "search" ? "Otsi Riigikogust" : "Kleebi tekst käsitsi"}
          </button>
        ))}
      </div>

      {tab === "search" && (
        <div className="flex flex-1 flex-col gap-2 overflow-hidden">
          <div className="flex gap-2">
            <input
              type="search"
              placeholder="Otsi pealkirja järgi…"
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

          {/* Preview panel */}
          {(fetching || preview || fetchError) && (
            <div className="rounded-md border border-neutral-200 bg-neutral-50 p-3">
              {fetching && (
                <div className="flex items-center gap-2 text-xs text-neutral-500">
                  <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-neutral-300 border-t-black" />
                  Laen eelnõu andmeid…
                </div>
              )}
              {fetchError && (
                <p className="text-xs text-red-600">{fetchError}</p>
              )}
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
                    <p className="line-clamp-4 text-[11px] leading-relaxed text-neutral-600">
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
                      <span className="text-[10px] text-amber-600">
                        PDF kättesaamatu — kasutatakse kokkuvõtet
                      </span>
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
                  <button
                    onClick={() => onDraftReady(preview.text, preview.title)}
                    disabled={loading}
                    className="w-full rounded-md bg-black py-2 text-xs font-medium text-white hover:bg-neutral-800 disabled:bg-neutral-300"
                  >
                    {loading ? "Otsin seoseid…" : "Käivita esmane kontroll →"}
                  </button>
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
            {!searching &&
              results.map((draft) => {
                const relevance = draftRelevance.get(draft.uuid);
                return (
                <button
                  key={draft.uuid}
                  onClick={() => loadPreview(draft)}
                  className={`flex w-full flex-col gap-0.5 border-b border-neutral-100 px-4 py-3 text-left transition-colors last:border-0 hover:bg-neutral-50 ${
                    preview?.uuid === draft.uuid ? "bg-neutral-50 ring-1 ring-inset ring-neutral-300" : ""
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className="text-sm font-medium text-neutral-900">{draft.title}</span>
                    {relevance === "high" && (
                      <span className="shrink-0 rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-700">Seotud</span>
                    )}
                    {relevance === "medium" && (
                      <span className="shrink-0 rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] text-neutral-500">Võib olla seotud</span>
                    )}
                  </span>
                  <span className="flex items-center gap-2 text-[11px] text-neutral-400">
                    <span className="font-mono">{draft.mark} {draft.draftTypeLabel}</span>
                    <span>·</span>
                    <span>{draft.stage}</span>
                    {draft.leadingCommittee && (
                      <>
                        <span>·</span>
                        <span>{draft.leadingCommittee}</span>
                      </>
                    )}
                    <span>·</span>
                    <span>{draft.initiated}</span>
                  </span>
                </button>
              ); })}
          </div>
        </div>
      )}

      {tab === "paste" && (
        <div className="flex flex-1 flex-col gap-3">
          <div className="rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-700">
            Kleebi siia eelnõu tekst, muudatusettepanek, seletuskirja lõik või muu tekst, mille mõju soovid kontrollida. Tekst peab sisaldama konkreetset muudatust, mitte ainult üldist ideed.
          </div>
          <textarea
            placeholder="nt: paragrahv 14 asendatakse - taotlus tuleb esitada 15 paeva jooksul..."
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            className="flex-1 resize-none rounded-md border border-neutral-200 p-3 text-sm text-neutral-900 focus:border-neutral-400 focus:outline-none"
          />
          <button
            onClick={() => onDraftReady(pasteText, "Kleebitud tekst")}
            disabled={pasteText.trim().length < 50 || loading}
            className="w-full rounded-md bg-black py-2.5 text-sm font-medium text-white transition-colors hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-300"
          >
            {loading ? "Otsin seoseid…" : "Käivita esmane kontroll →"}
          </button>
          {pasteText.trim().length > 0 && pasteText.trim().length < 50 && (
            <p className="text-center text-xs text-neutral-400">Tekst on liiga lühike — lisa vähemalt 50 tähemärki</p>
          )}
        </div>
      )}
    </div>
  );
}
