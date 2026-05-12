import { useState } from "react";

interface Props {
  onDismiss: () => void;
  onDemo: () => void;
}

const IMPACT_TYPES = [
  "Õigused ja kohustused", "Tähtajad", "Menetlus", "Andmed ja registrid",
  "Järelevalve", "Rahaline mõju", "Asutuse töökorraldus", "KOV ülesanded",
];

type Tab = "workflow" | "input" | "results" | "feedback";

const TABS: { id: Tab; label: string }[] = [
  { id: "workflow", label: "Töövoog" },
  { id: "input",    label: "Mida sisestada?" },
  { id: "results",  label: "Tulemused" },
  { id: "feedback", label: "Tagasiside" },
];

export function OnboardingOverlay({ onDismiss, onDemo }: Props) {
  const [tab, setTab] = useState<Tab>("workflow");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-lg rounded-xl border border-neutral-200 bg-white shadow-xl">

        {/* Header */}
        <div className="border-b border-neutral-100 px-6 pt-6 pb-4">
          <h2 className="text-xl font-bold text-neutral-900">Sinu autonoomne õigusnõunik</h2>
          <p className="mt-1 text-sm font-medium text-neutral-500">
            Analüüsi eelnõusid 80 000+ paragrahvi vastu sekunditega, mitte tundidega.
          </p>
          <p className="mt-2 text-xs text-neutral-400 leading-relaxed">
            Kirjelda kavandatavat muudatust — süsteem tuvastab mõjutatud aktid,
            vastutavad ministeeriumid ja konkreetsed paragrahvid automaatselt.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-neutral-100">
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex-1 px-2 py-2.5 text-xs font-medium transition-colors ${
                tab === id
                  ? "border-b-2 border-black text-black"
                  : "text-neutral-500 hover:text-neutral-700"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="px-6 py-5 text-sm" style={{ minHeight: "260px" }}>

          {/* ── Töövoog ── */}
          {tab === "workflow" && (
            <div className="space-y-4">
              <div className="rounded-md bg-neutral-50 p-4">
                <p className="font-medium text-neutral-800">Kolm sammu</p>
                <ol className="mt-2 space-y-2 text-xs text-neutral-600">
                  {[
                    ["Lisa muudatus", "kirjuta eelnõu, muudatusettepanek või seletuskirja lõik"],
                    ["Süsteem leiab kandidaataktid", "kontrollib 80 000+ paragrahvi ja valib automaatselt seotud aktid"],
                    ["Kontrolli tulemused", "vaata kriitiliselt, mis on oluline ja mis mitte — kinnita või tõrjesta"],
                  ].map(([bold, rest], i) => (
                    <li key={i} className="flex gap-2">
                      <span className="font-mono font-bold text-neutral-400 shrink-0">{i + 1}.</span>
                      <span><strong>{bold}</strong> — {rest}</span>
                    </li>
                  ))}
                </ol>
              </div>

              <div className="rounded-md border border-neutral-200 p-3 text-xs text-neutral-600">
                <p className="font-medium mb-2">Kaks töörežiimi:</p>
                <div className="space-y-2">
                  <div>
                    <span className="font-medium text-neutral-800">Automaatne otsing</span>
                    <span className="ml-1 rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] text-neutral-500">vaikimisi</span>
                    <p className="mt-0.5 text-neutral-500">Lisa muudatus — tööriist leiab ise kandidaataktid semantilise otsingu abil.</p>
                  </div>
                  <div>
                    <span className="font-medium text-neutral-800">Käsitsi valimine</span>
                    <p className="mt-0.5 text-neutral-500">Vali konkreetne kehtiv akt ja võrdle seda muudatusega.</p>
                  </div>
                </div>
              </div>

              <div className="rounded-md border border-neutral-100 bg-neutral-50 p-3 text-xs text-neutral-500 space-y-1.5">
                <p className="font-medium text-neutral-600">Miks see ei hallutsineerida?</p>
                <p>Erinevalt tavalisest AI-st otsib süsteem vastused <strong className="text-neutral-700">reaalsest Riigi Teataja andmebaasist</strong>, mitte oma mälust. Iga viide on pärit konkreetsest paragrahvist — mitte genereeritud.</p>
              </div>
            </div>
          )}

          {/* ── Mida sisestada? ── */}
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
                      <span className="text-green-500 shrink-0">✓</span>{s}
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
                      <span className="shrink-0">✗</span>{s}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* ── Tulemused ── */}
          {tab === "results" && (
            <div className="space-y-3">
              <p className="text-xs text-neutral-600 leading-relaxed">
                Tulemus näitab tekstilist kattuvust — mitte kindlat vastuolu. Lõpliku hinnangu
                peab andma inimene.
              </p>

              <div className="space-y-1.5">
                {[
                  { label: "A — Otseselt muudetav", color: "bg-neutral-800 text-white",                   desc: "Eelnõu pealkiri nimetab seda akti otseselt." },
                  { label: "B — Sisuliselt seotud",  color: "bg-neutral-100 text-neutral-700",             desc: "Semantiline kattuvus märksõnade ja paragrahvidega." },
                  { label: "Kõrge seos",             color: "bg-orange-50 text-orange-700 border border-orange-200", desc: "Palju kattuvaid termineid — sisuline kontroll soovitatav." },
                  { label: "Ebaoluline",             color: "bg-neutral-50 text-neutral-400 border border-neutral-200", desc: "Kasutaja on märkinud seose ebaoluliseks." },
                ].map((level) => (
                  <div key={level.label} className="flex items-start gap-2">
                    <span className={`shrink-0 rounded px-2 py-0.5 text-[11px] font-medium ${level.color}`}>{level.label}</span>
                    <span className="text-xs text-neutral-600 pt-0.5">{level.desc}</span>
                  </div>
                ))}
              </div>

              <div className="rounded-md border border-neutral-100 bg-neutral-50 p-3 text-xs">
                <p className="font-medium text-neutral-600 mb-1.5">Võimalikud mõju tüübid:</p>
                <div className="flex flex-wrap gap-1.5">
                  {IMPACT_TYPES.map((t) => (
                    <span key={t} className="rounded border border-neutral-200 bg-white px-2 py-0.5 text-[11px] text-neutral-500">{t}</span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Tagasiside ── */}
          {tab === "feedback" && (
            <div className="space-y-4">
              <div className="grid gap-2 sm:grid-cols-2">
                {[
                  { label: "Täpsus",              text: "Kas süsteem leidis seadused, mida eeldasid? Kas oli asjakohatu \"müra\"?" },
                  { label: "Argumentatsioon",     text: "Vali \"Miks see leiti?\". Kas AI põhjendus on juriidiliselt loogiline?" },
                  { label: "Mustandi kvaliteet",  text: "Kas genereeritud seletuskirja tekst on piisavalt hea väikese toimetamisega?" },
                  { label: "Usaldus",             text: "Kas RT-viited ja paragrahvilingid aitavad kontrolli kiiremini läbi viia?" },
                ].map((item) => (
                  <div key={item.label} className="rounded-md border border-neutral-200 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">{item.label}</p>
                    <p className="mt-1 text-xs text-neutral-600 leading-relaxed">{item.text}</p>
                  </div>
                ))}
              </div>

              <div className="rounded-md bg-neutral-900 px-4 py-3.5 text-white">
                <p className="text-xs font-semibold">30 sekundi reegel</p>
                <p className="mt-1 text-[11px] text-neutral-300 leading-relaxed">
                  Süsteem on loodud nii, et jurist saaks iga AI väidet kontrollida alla 30 sekundiga.
                  Mitte see, et AI on tark — vaid see, et AI on <span className="text-white font-medium">kontrollitav</span>.
                </p>
              </div>

              <div className="text-xs text-neutral-500 space-y-1">
                <p className="font-medium text-neutral-600">Abivahendid ülevaatuseks:</p>
                <ul className="space-y-0.5">
                  <li><span className="font-medium text-neutral-700">Mõtlemise logi</span> — näed reaalajas, milliseid paragrahve agent analüüsib</li>
                  <li><span className="font-medium text-neutral-700">Kinnitusring</span> — märgi seosed oluliseks/ebaoluliseks; süsteem mäletab valikuid</li>
                  <li><span className="font-medium text-neutral-700">Mustandi kopeerimine</span> — seletuskirja tekst on kopeeritav otse Wordi</li>
                </ul>
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
