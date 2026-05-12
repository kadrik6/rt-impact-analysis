import { useState } from "react";

interface Props {
  onDismiss: () => void;
  onDemo: () => void;
}

const IMPACT_TYPES = [
  "Õigused ja kohustused",
  "Tähtajad",
  "Menetlus",
  "Andmed ja registrid",
  "Järelevalve",
  "Rahaline mõju",
  "Asutuse töökorraldus",
  "Kohaliku omavalitsuse ülesanded",
];

export function OnboardingOverlay({ onDismiss, onDemo }: Props) {
  const [tab, setTab] = useState<"what" | "input" | "results">("what");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-lg rounded-xl border border-neutral-200 bg-white shadow-xl">

        {/* Header */}
        <div className="border-b border-neutral-100 px-6 pt-6 pb-4">
          <h2 className="text-xl font-bold text-neutral-900">Sinu autonoomne õigusnõunik</h2>
          <p className="mt-1 text-sm font-medium text-neutral-500">
            Analüüsi eelnõusid 80 000+ paragrahvi vastu sekunditega, mitte tundidega.
          </p>
          <p className="mt-2 text-xs text-neutral-400">
            Kirjelda kavandatavat muudatust — süsteem tuvastab mõjutatud aktid, vastutavad
            ministeeriumid ja konkreetsed paragrahvid automaatselt.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-neutral-100">
          {([
            ["what", "Kuidas töötab?"],
            ["input", "Mida sisestada?"],
            ["results", "Mida tulemus tähendab?"],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex-1 px-3 py-2.5 text-xs font-medium transition-colors ${
                tab === id ? "border-b-2 border-black text-black" : "text-neutral-500 hover:text-neutral-700"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="px-6 py-5 text-sm">

          {tab === "what" && (
            <div className="space-y-4">
              <div className="rounded-md bg-neutral-50 p-4">
                <p className="font-medium text-neutral-800">Vaikimisi töövoog</p>
                <ol className="mt-2 space-y-2 text-neutral-600 text-xs">
                  <li className="flex gap-2">
                    <span className="font-mono font-bold text-neutral-400">1.</span>
                    <span><strong>Lisa muudatus</strong> — kirjuta või lae üles eelnõu, muudatusettepanek või seletuskirja lõik</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="font-mono font-bold text-neutral-400">2.</span>
                    <span><strong>Süsteem leiab kandidaataktid</strong> — kontrollib kataloogi ja valib automaatselt tõenäoliselt seotud aktid</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="font-mono font-bold text-neutral-400">3.</span>
                    <span><strong>Kontrolli tulemused üle</strong> — vaata kriitiliselt, mis on oluline ja mis mitte</span>
                  </li>
                </ol>
              </div>

              <div className="rounded-md border border-neutral-200 p-3 text-xs text-neutral-600">
                <p className="font-medium mb-1.5">Kaks töörežiimi:</p>
                <div className="space-y-2">
                  <div>
                    <span className="font-medium text-neutral-800">Automaatne otsing</span>
                    <span className="ml-1 rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] text-neutral-500">vaikimisi</span>
                    <p className="mt-0.5 text-neutral-500">Lisa muudatus, tööriist leiab ise kandidaataktid.</p>
                  </div>
                  <div>
                    <span className="font-medium text-neutral-800">Käsitsi valimine</span>
                    <p className="mt-0.5 text-neutral-500">Vali ise konkreetne kehtiv akt ja võrdle seda muudatusega.</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab === "input" && (
            <div className="space-y-4">
              <div>
                <p className="text-xs font-semibold text-green-700 mb-2">✓ Sobivad sisendid</p>
                <ul className="space-y-1.5">
                  {[
                    "Lühendame taotluse esitamise tähtaega 30 päevalt 15 päevale.",
                    "Lisame kohustuse esitada andmed uude registrisse.",
                    "Muudame toetuse andmise tingimusi.",
                    "Anname ametile õiguse teha täiendavat järelevalvet.",
                    "Vähendame aruandluskohustust väikestele ettevõtjatele.",
                    "Kehtiv seaduseelnõu tekst Riigikogust",
                    "Seletuskirja mõju analüüsi lõik",
                  ].map((s, i) => (
                    <li key={i} className="flex gap-2 text-xs text-neutral-700">
                      <span className="text-green-500 shrink-0">✓</span> {s}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-xs font-semibold text-neutral-500 mb-2">✗ Liiga üldised — annavad ebatäpseid tulemusi</p>
                <ul className="space-y-1.5">
                  {[
                    "Tee süsteem paremaks.",
                    "Muudame seadust kaasaegsemaks.",
                    "Vähendame bürokraatiat.",
                  ].map((s, i) => (
                    <li key={i} className="flex gap-2 text-xs text-neutral-500">
                      <span className="shrink-0">✗</span> {s}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {tab === "results" && (
            <div className="space-y-3">
              <p className="text-xs text-neutral-600 leading-relaxed">
                Tulemus näitab tekstilist kattuvust — mitte kindlat vastuolu. Lõpliku hinnangu
                peab andma inimene.
              </p>
              <div className="space-y-2">
                {[
                  { label: "Seotud", color: "bg-green-100 text-green-700", desc: "Tugev märksõnakattuvus — tõenäoliselt seotud teemaga." },
                  { label: "Võib olla seotud", color: "bg-neutral-100 text-neutral-600", desc: "Osaline kattuvus — vajab ülevaatust." },
                  { label: "Ebaoluline", color: "bg-neutral-50 text-neutral-400 border border-neutral-200", desc: "Kasutaja on märkinud seose ebaoluliseks." },
                ].map((level) => (
                  <div key={level.label} className="flex items-start gap-2">
                    <span className={`shrink-0 rounded px-2 py-0.5 text-[11px] font-medium ${level.color}`}>{level.label}</span>
                    <span className="text-xs text-neutral-600">{level.desc}</span>
                  </div>
                ))}
              </div>
              <div className="rounded-md border border-neutral-100 bg-neutral-50 p-3 text-xs">
                <p className="font-medium text-neutral-600 mb-1.5">Võimalikud mõju tüübid:</p>
                <div className="flex flex-wrap gap-1.5">
                  {IMPACT_TYPES.map((t) => (
                    <span key={t} className="rounded bg-white border border-neutral-200 px-2 py-0.5 text-[11px] text-neutral-500">{t}</span>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 border-t border-neutral-100 px-6 py-4">
          <button
            onClick={onDemo}
            className="rounded-md border border-neutral-200 px-4 py-2 text-xs text-neutral-600 hover:bg-neutral-50"
          >
            Vaata näidisanalüüsi
          </button>
          <button
            onClick={onDismiss}
            className="flex-1 rounded-md bg-black px-4 py-2 text-xs font-medium text-white hover:bg-neutral-800"
          >
            Alusta →
          </button>
        </div>
      </div>
    </div>
  );
}
