import { useState, useRef, useEffect } from "react";

interface Props {
  text: string;
  children?: React.ReactNode;
}

export function Tooltip({ text, children }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <span ref={ref} className="relative inline-flex items-center">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-neutral-300 bg-white text-[10px] font-bold text-neutral-500 hover:border-neutral-500 hover:text-neutral-700"
        aria-label="Selgitus"
      >
        {children ?? "?"}
      </button>
      {open && (
        <div className="absolute left-5 top-0 z-50 w-64 rounded-md border border-neutral-200 bg-white p-3 shadow-lg">
          <p className="text-xs leading-relaxed text-neutral-700">{text}</p>
        </div>
      )}
    </span>
  );
}
