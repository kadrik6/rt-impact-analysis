# Memo: JDM andmepõhise juhtimise ja automatiseerimise arendusportfelli seis

**Kuupäev:** 2026-05-12
**Koostaja:** Kadri Kungla
**Adressaat:** Juhtkond

---

## Eesmärk

Anda juhtkonnale ülevaade loodud ja arendamisel olevatest lahendustest ning tuua välja, millised projektid vajavad otsust, prioriseerimist või tuge.

---

## Kokkuvõte

JDM-is on tekkinud mitu praktilist andme-, aruandlus-, automatiseerimis- ja AI-toega lahendust, mille ühine eesmärk on vähendada käsitööd, parandada andmekvaliteeti ja toetada juhtimisotsuseid.

Lahendused on arendatud erinevates küpsusastmetes — osad toimivad juba tootmiskeskkonnas, osad on prototüübi faasis. Ühine risk on, et tööriistad on loodud üksikute inimeste initsiatiivil ilma formaalse vastutuse ja haldusplaanita, mis seab pikaajalise jätkusuutlikkuse küsimärgi alla.

---

## Peamised projektid

### 1. Eelarve juhtimislaud
Interaktiivne aruandluslahendus eelarve täitmise jälgimiseks. Võimaldab osakonnajuhtidel näha reaalajas kulude jaotust ilma SAP-i käsitsi päringuteta.

**Seis:** Kasutusel. Andmevärskendus toimub poolautomaatselt.
**Risk:** Andmesisestus sõltub ühest inimesest; uuenduste sagedus ebaühtlane.

### 2. Delta / lepingute andmete korrastamine
Lepinguregistri andmete puhastamine ja struktureerimine Delta-st terviklikuks andmeallikaks. Eeldus mitme allavoolu aruande jaoks.

**Seis:** Pooleli. Andmekvaliteedi probleemid (duplikaadid, puuduvad kuupäevad, ebaühtlane klassifikatsioon) blokeerivad edasist kasutust.
**Risk:** Ilma puhta alusandmeta ei ole eelarvelaud ega SAP-aruandlus täielikult usaldusväärsed.

### 3. SAP aruandluse automatiseerimine
Korduvate SAP-aruannete (kuluaruanded, hanked, eelarve vs. tegelik) automatiseerimine, et vähendada käsitsi allalaadimist ja Exceli töötlemist.

**Seis:** Osaliselt automatiseeritud. Mõned aruanded genereeritakse käivitamisel, teised nõuavad veel käsitsi sekkumist.
**Risk:** Automatiseerimisreeglid on dokumenteerimata; uue inimese sisseelamise aeg pikk.

### 4. Andmevara / Purview / andmehaldus
Organisatsiooni andmevarade kaardistamine Microsoft Purview abil — andmeallikad, vastutajad, klassifikatsioon, säilitustähtajad.

**Seis:** Algatatud. Purview on seadistatud, kuid kataloogi täidetuse tase madal.
**Risk:** Ilma aktiivse täitmiseta ei anna kataloog väärtust; andmejuhtimise kultuur vajab toetust juhtkonnalt.

### 5. AI-toega prototüübid ja tööriistad
Mitme AI-kiirendatud töövoo prototüübid: dokumendivõrdlus, teksti kokkuvõtmine, andmepäringute lihtsustamine loomuliku keele abil.

**Seis:** Prototüüpide faas. Tööriistad on funktsionaalsed, kuid ei ole läbinud IT-turva hindamist ega sõltumatut testimist.
**Risk:** AI-väljundite auditeeritavus peab olema tagatud enne ametlikku kasutuselevõttu.

### 6. Õigusloome mõjuanalüüsi lahendus (rt-impact-analysis)
RAG-põhine (Retrieval-Augmented Generation) süsteem, mis analüüsib seaduseelnõusid Riigi Teataja korpuse vastu. Tuvastab mõjutatud seadused, vastutavad ministeeriumid ja konkreetsed paragrahvid, mis vajavad muutmist. Iga väide on varustatud tsitaadiga ja usaldusskoriga.

**Seis:** MVP valmis. Ingestimise pipeline, deterministlik skoorimismootor, Claude-põhine analüüs ja React-kasutajaliides on töökorras. Puudub valideeritud tootmisandmetega läbijooks.
**Risk:** Riigi Teataja XML-formaadi muutused võivad parsimise katkestada; vajab regulaarset andmevärskendust.

### 7. Siseveebi / SharePointi projektide portfell
Siseveebi haldus, protsessivormide digitaliseerimine ja SharePointi töövood.

**Seis:** Jooksvad. Osa vorme digitaliseeritud, osa protsesse endiselt paber- või e-kirjapõhised.
**Risk:** SharePointi arhitektuur on orgaaniliselt kasvanud; otsingukogemus nõrk, mis vähendab kasutusmäära.

---

## Põhilised tähelepanekud

1. **Killustatus** — lahendused on arendatud eraldi, omavaheline sõltuvus (nt Delta-andmed toidavad eelarvelauda) ei ole selgelt hallatud. Ühe komponendi rike mõjutab teisi.

2. **Üksikute inimeste sõltuvus** — mitme lahenduse teadmus on kontsentreeritud ühele inimesele. Haiguse või lahkumise korral tekib teenuse katkestus.

3. **Andmekvaliteet on kitsaskoht** — Delta lepinguandmete probleemid blokeerivad nii eelarvelauda kui SAP-aruandlust. Andmete korrastamine peaks olema portfelli prioriteet nr 1.

4. **AI-lahendused vajavad selget poliitikakaadreid** — prototüübid on tehniliselt teostatavad, kuid organisatsioon vajab selget seisukohta: millistel tingimustel AI-genereeritud väljundit võib ametlikes protsessides kasutada?

5. **Positiivne mõju on mõõdetav** — kus automatiseerimine on juurutatud, on käsitöö tundide arv vähenenud. See vajab dokumenteerimist, et põhjendada edasisi investeeringuid.

---

## Vajalikud otsused

| # | Küsimus | Valikud | Kes otsustab |
|---|---------|---------|--------------|
| 1 | Millisel prioriteedijärjekorras rahastada portfelli projekte 2026 H2-s? | Delta puhastamine esimesena vs. paralleelne arendus | Osakonnajuht |
| 2 | Kes vastutab iga lahenduse halduse ja andmevärskenduse eest pikemas perspektiivis? | Määrata ametlik "tööriista omanik" igale lahendusele | IT + äriüksused |
| 3 | Kas rt-impact-analysis viiakse pilootfaasi (reaalsed eelnõud, kasutajate testimine)? | Jah — siis vajab ressurssi; Ei — prototüübina külmutada | Osakonnajuht + IT |
| 4 | Mis on AI-kasutuse poliitika ametlikes protsessides? | Kasutaja kinnitab iga väite (praegune lähenemine) vs. täielik automatiseerimine | Juhtkond + jurist |
| 5 | Kas Purview andmekataloog peaks olema kohustuslik kõikidele uutele andmeallikatele? | Kohustuslik vs. vabatahtlik | CIO / andmejuht |

---

## Soovitus

**Lühiajaline (0–3 kuud):**
- Alustada Delta lepinguandmete korrastamisega — see vabastab kitsaskoha, mis blokeerib mitu teist projekti.
- Määrata igale lahendusele omanik ja dokumenteerida minimaalne haldusprotsess (andmevärskendus, tõrkekäsitlus).

**Keskaeg (3–6 kuud):**
- Viia rt-impact-analysis pilootfaasi: käivitada tootmisandmetega ingestimise tsükkel, kaasata paar ministeeriumiametnikku kasutajatestimiseks.
- Koostada AI-kasutuse sisepoliitika, mis defineerib inimese kinnitamise nõude eri riskitasemetel.

**Pikaajaline (6–12 kuud):**
- Konsolideerida andmevoog: Delta → Supabase / andmeladu → juhtimislaual, et vältida andmekopeerimist käsitsi.
- Hinnata SharePointi arhitektuuri ümberkorraldamist, kui kasutusmäär jääb madalaks.

> **Põhisõnum juhtkonnale:** Lahendused on valmis — investeering on tehtud. Edasine küsimus ei ole "kas arendada", vaid "kes haldab ja mis järjekorras juurutada". Otsuseta portfell hajub; otsustega portfell muutub organisatsiooni konkurentsieeliseks.
