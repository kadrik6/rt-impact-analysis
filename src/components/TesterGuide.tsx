interface Props {
  onClose: () => void;
}

export function TesterGuide({ onClose }: Props) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-10"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-2xl rounded-xl border border-neutral-200 bg-white shadow-2xl">

        {/* Header */}
        <div className="flex items-start justify-between border-b border-neutral-100 px-7 py-5">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-neutral-400">Testijale</p>
            <h2 className="mt-1 text-xl font-bold text-neutral-900">Tere tulemast testima AI-õigusnõuniku prototüüpi</h2>
            <p className="mt-1.5 text-sm text-neutral-600 leading-relaxed">
              Eesmärk on automatiseerida mõjuanalüüsi mahukam osa — süsteem ei asenda juristi,
              vaid on "nutikas praktikant", kes teeb esmase töö ära sekunditega.
            </p>
          </div>
          <button
            onClick={onClose}
            className="ml-4 shrink-0 rounded-md p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
            aria-label="Sulge"
          >
            ✕
          </button>
        </div>

        <div className="space-y-6 px-7 py-6">

          {/* How it works */}
          <section>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-neutral-800">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-neutral-100 font-mono text-xs text-neutral-600">1</span>
              Kuidas see toimib?
            </h3>
            <p className="mt-2 text-xs text-neutral-500 leading-relaxed">
              Erinevalt tavalisest ChatGPT-st, mis toetub oma mälule (ja võib hallutsineerida),
              kasutab see platvorm <strong className="text-neutral-700">agentset RAG-torustikku</strong>:
            </p>
            <div className="mt-3 space-y-2">
              {[
                {
                  label: "Andmebaas",
                  text: "Üle 80 000 Riigi Teataja paragrahvi on indekseeritud ja embedditud vektormällu.",
                },
                {
                  label: "Semantiline otsing",
                  text: "Süsteem ei otsi ainult märksõnu — ta mõistab sisu. Eelnõu \"töötasude\" kohta viib automaatselt \"palgaseaduseni\", isegi kui täpset sõna pole kasutatud.",
                },
                {
                  label: "Agentne kontroll (Tool Calling)",
                  text: "Kui agent leiab kahtlase seose, pärib ta reaalajas paragrahvi täisteksti, kontrollib kehtivust ja analüüsib seost süvitsi enne vastamist.",
                },
              ].map((item) => (
                <div key={item.label} className="flex gap-3 rounded-md border border-neutral-100 bg-neutral-50 px-3 py-2.5">
                  <span className="mt-0.5 shrink-0 font-mono text-[11px] font-semibold text-neutral-500">{item.label}</span>
                  <span className="text-xs text-neutral-600 leading-relaxed">{item.text}</span>
                </div>
              ))}
            </div>
          </section>

          {/* What to test */}
          <section>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-neutral-800">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-neutral-100 font-mono text-xs text-neutral-600">2</span>
              Mida testida?
            </h3>
            <div className="mt-3 space-y-2">
              {[
                {
                  n: "01",
                  title: "Automaatne mõju kontroll",
                  text: "Kleebi eelnõu tekst või muudatusettepanek — vaata, milliseid seadusi süsteem mõjutatuna tuvastab.",
                },
                {
                  n: "02",
                  title: "Seoste prioritiseerimine",
                  text: "Kategooria A = otseselt muudetav (pealkirja põhjal). Kategooria B = sisuliselt seotud (semantilise analüüsi tulemus).",
                },
                {
                  n: "03",
                  title: "Ühe-kliki mõjuanalüüs",
                  text: "Pärast seoste kinnitamist genereerib süsteem ametliku seletuskirja mustandi — 5 jaotist: õiguskord, eelarve, halduskoormus, sihtrühmad, proportsionaalsus.",
                },
              ].map((item) => (
                <div key={item.n} className="flex gap-3">
                  <span className="mt-0.5 shrink-0 font-mono text-xs font-bold text-neutral-300">{item.n}</span>
                  <div>
                    <p className="text-xs font-semibold text-neutral-700">{item.title}</p>
                    <p className="mt-0.5 text-xs text-neutral-500 leading-relaxed">{item.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Feedback criteria */}
          <section>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-neutral-800">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-neutral-100 font-mono text-xs text-neutral-600">3</span>
              Sinu tagasiside on kriitiline — mida jälgida?
            </h3>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {[
                {
                  label: "Täpsus",
                  text: "Kas süsteem leidis seadused, mida eeldasid? Kas esines asjakohatu \"müra\"?",
                },
                {
                  label: "Argumentatsioon",
                  text: "Vali \"Miks see leiti?\". Kas AI põhjendus on juriidiliselt loogiline või pealiskaudne?",
                },
                {
                  label: "Mustandi kvaliteet",
                  text: "Kas genereeritud seletuskirja tekst on piisavalt hea väikese toimetamisega kasutamiseks?",
                },
                {
                  label: "Usaldus",
                  text: "Kas viited konkreetsetele paragrahvidele ja RT-linkidele aitavad kontrolli kiiremini läbi viia?",
                },
              ].map((item) => (
                <div key={item.label} className="rounded-md border border-neutral-200 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">{item.label}</p>
                  <p className="mt-1 text-xs text-neutral-600 leading-relaxed">{item.text}</p>
                </div>
              ))}
            </div>
          </section>

          {/* 30-second rule */}
          <div className="rounded-md border border-neutral-900 bg-neutral-900 px-4 py-3.5 text-sm text-white">
            <p className="font-semibold">30 sekundi reegel</p>
            <p className="mt-1 text-neutral-300 text-xs leading-relaxed">
              Süsteem on loodud nii, et jurist saaks iga AI väidet kontrollida alla 30 sekundiga.
              Mitte see, et AI on tark — vaid see, et AI on <span className="text-white font-medium">kontrollitav</span>.
            </p>
          </div>

          {/* UX notes */}
          <section className="rounded-md border border-blue-100 bg-blue-50 px-4 py-3 text-xs text-blue-800">
            <p className="font-semibold mb-1.5">Kujunduslikud abivahendid</p>
            <ul className="space-y-1 text-blue-700">
              <li><span className="font-medium">Mõtlemise logi</span> — näed reaalajas, milliseid paragrahve agent parasjagu analüüsib.</li>
              <li><span className="font-medium">Markdowni tugi</span> — mustandi tekst on kopeeritav otse Wordi koos korrektse liigendusega.</li>
              <li><span className="font-medium">Kinnitusring</span> — märgi iga seos kas oluliseks või ebaoluliseks. Süsteem mäletab sinu valikuid.</li>
            </ul>
          </section>

        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-neutral-100 px-7 py-4">
          <p className="text-[11px] text-neutral-400">
            Prototüüp · Kõik leitud seosed vajavad inimese ülevaatust
          </p>
          <button
            onClick={onClose}
            className="rounded-md bg-black px-4 py-2 text-xs font-medium text-white hover:bg-neutral-800"
          >
            Alusta testimist →
          </button>
        </div>

      </div>
    </div>
  );
}
