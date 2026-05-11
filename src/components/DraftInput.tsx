import { useState } from "react";

interface Props {
  onAnalyse: (text: string) => void;
  loading: boolean;
}

export function DraftInput({ onAnalyse, loading }: Props) {
  const [text, setText] = useState("");

  return (
    <div className="flex h-full flex-col gap-4">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-widest text-neutral-500">
          01 — Eelnõu
        </h2>
        <p className="mt-1 text-xs text-neutral-400">
          Kleebi seaduseelnõu tekst või kavandatav muudatus
        </p>
      </div>

      <textarea
        className="flex-1 resize-none rounded-md border border-neutral-200 bg-white p-4 font-mono text-sm leading-relaxed text-neutral-800 placeholder:text-neutral-400 focus:border-neutral-400 focus:outline-none"
        placeholder="§ 1. Käesolev seadus reguleerib..."
        value={text}
        onChange={(e) => setText(e.target.value)}
        spellCheck={false}
      />

      <div className="flex items-center justify-between gap-4">
        <span className="text-xs text-neutral-400">{text.length} märki</span>
        <button
          onClick={() => onAnalyse(text)}
          disabled={loading || text.trim().length < 50}
          className="rounded-md bg-black px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-300"
        >
          {loading ? "Analüüsin…" : "Analüüsi mõju →"}
        </button>
      </div>
    </div>
  );
}
