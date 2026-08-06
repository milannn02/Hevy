# Wetenschappelijke verificatie-blueprint — Trainingslogboek

Doel: een gestructureerd plan waarmee een verificatie-agent (bijv. **Claude + Scholar Sidekick + websearch**)
elke wetenschappelijke claim, formule en vuistregel in de app kan **controleren** op:

1. **Formule-correctheid** — klopt de wiskunde met de bron waaruit ze zou komen?
2. **Onderbouwing** — bestaat er (en hoe sterk is) bewijs in de literatuur?
3. **Toepassingsgrenzen** — wanneer klopt de claim níét (rep-bereik, oefening, populatie)?
4. **Citaat-integriteit** — zijn de aangehaalde bronnen echt (geen verzonnen titel bij een echte DOI)?

> ⚠️ **Lees dit eerst.** De "kandidaat-bronnen" hieronder zijn **ONGEVERIFIEERD**. Ze komen uit
> herinnering en kunnen fout zijn (verkeerd jaar, tijdschrift, of zelfs niet-bestaand). De agent moet
> ze **eerst controleren met Scholar Sidekick `verifyCitation`** (titel ↔ DOI/PMID) en `checkRetraction`
> vóór hij ze als waar behandelt. Vertrouw de claims in dit document niet; toets ze.

---

## 1. Verificatie-methodiek (per claim uitvoeren)

Voer voor elke claim `Cn` dit protocol uit en leg het resultaat vast (zie output-sjabloon in §5):

1. **Reproduceer de formule** uit de aangegeven regel in `app.js` en controleer ze wiskundig los van elke bron.
2. **Zoek de primaire bron(nen).** Gebruik websearch/`WebFetch` voor de literatuur; los identifiers (DOI/PMID) op.
3. **Verifieer élk citaat** met Scholar Sidekick:
   - `verifyCitation` — vergelijkt de geclaimde titel met het record achter de DOI/PMID (vangt de dominante fabricatie: echte DOI + verzonnen titel).
   - `checkRetraction` — ingetrokken / correctie / expression of concern?
   - `checkOpenAccess` — legale gratis full-text om de claim in de tekst na te lezen.
   - `auditBibliography` — voor de hele bronnenlijst in één keer.
4. **Beoordeel het bewijsniveau** (rubriek §3).
5. **Bepaal de toepassingsgrenzen** en edge-cases.
6. **Geef een oordeel**: `Correct` / `Correct-met-nuance` / `Vereenvoudiging` / `Onjuist/Verouderd`, met een concrete aanbevolen tekst- of code-wijziging als dat nodig is.

---

## 2. Prioritering

Sorteer op **(impact op het advies aan de gebruiker) × (onzekerheid)**. Hoogste prioriteit eerst:

- **Hoog**: C1 (e1RM), C4 (rep-bereik↔doel), C5 (10–20 sets), C8 (werkgewicht-formule), C11 (krachtstandaarden).
- **Midden**: C2, C3, C6, C9, C10, C13.
- **Laag / documentatie**: C7, C12, C14, C15, C16.

---

## 3. Bewijs-rubriek (gebruik consequent)

| Niveau | Betekenis |
|---|---|
| **A** | Meta-analyse / systematic review van RCT's |
| **B** | Eén of enkele RCT's |
| **C** | Observationeel / cross-sectioneel / mechanistisch |
| **D** | Expert-opinie, leerboek-conventie, coach-praktijk, commerciële norm |
| **E** | Onbekend / geen bron gevonden |

Noteer ook een **confidence** (laag/midden/hoog) voor je eigen oordeel ná verificatie.

---

## 4. Claim-register

Velden per claim: **Claim (zoals geïmplementeerd) · Locatie · Type · Kandidaat-bron (ONGEVERIFIEERD) · Verwacht niveau · Verificatievragen · Bekende nuances**.

### A. Schattingsformules

**C1 — e1RM via Epley**
- Claim: `e1RM = gewicht × (1 + reps/30)`, en bij 1 rep = gewicht.
- Locatie: `app.js` → `const e1rm` (~r.41). Gebruikt in PR's, Progressie, Benchmark, Plan.
- Type: formule.
- Kandidaat-bron (ONGEVERIFIEERD): Epley (1985), *Poundage Chart*, Boyd Epley Workout, Lincoln NE.
- Verwacht niveau: B–C (empirisch redelijk voor ~1–10 reps).
- Verificatievragen: (a) is de formule-vorm exact Epley? (b) gemiddelde fout t.o.v. gemeten 1RM per rep-categorie? (c) vanaf welk rep-aantal loopt de fout sterk op? (d) systematische over-/onderschatting vs. alternatieven?
- Nuances: de reps↔%1RM-relatie verschilt per **oefening** (bench ≠ squat ≠ deadlift) en per **individu**; Epley behandelt ze gelijk.

**C2 — Omgekeerde Epley voor rep-doelen**
- Claim: `reps = 30 × (e1RM/gewicht − 1)`.
- Locatie: `app.js` rep-doelen-tabel in `renderProgressie` (~r.540).
- Type: formule (algebraïsche omkering van C1).
- Erft bron/nuance van C1. Extra vraag: is de omkering betrouwbaar bij lage %1RM (hoge reps)?

**C3 — %1RM → reps + trainingszones**
- Claim: zones ≥90% = "Kracht", 75–90% = "Hypertrofie", <75% = "Volume/techniek".
- Locatie: `renderProgressie` rep-tabel.
- Type: leerboek-conventie.
- Kandidaat-bron (ONGEVERIFIEERD): NSCA — Baechle & Earle, *Essentials of Strength Training and Conditioning* (%1RM-rep tabellen).
- Verwacht niveau: C–D.
- Vragen: klopt de %→rep-tabel met NSCA? Is de rigide zone-indeling nog houdbaar gezien recent hypertrofie-onderzoek (zie C4)?

### B. Programmeer-heuristieken

**C4 — Rep-bereik ↔ doel (schema)**
- Claim: Kracht = 4–6 reps, Spiergroei = 6–15 reps (compound 6–10, isolatie 10–15).
- Locatie: `scheme()` in het Plan (~r.800).
- Type: heuristiek.
- Kandidaat-bron (ONGEVERIFIEERD): Schoenfeld, Grgic et al. (2017) low- vs high-load meta-analyse; ACSM position stand (2009) "Progression models in resistance training."
- Verwacht niveau: A (voor hypertrofie-breedte).
- **Waarschijnlijke nuance/vereenvoudiging**: hypertrofie treedt op over een **breed** rep-bereik (~5–30+) mits dicht bij spierfalen; "hypertrofie = 6–15" is didactisch maar niet strikt. Kracht is wél loadspecifieker (lage reps/hoge %1RM). Verifieer en formuleer de nuance.

**C5 — 10–20 werksets per spiergroep per week**
- Claim: richtlijn 10–20 sets/spiergroep/week.
- Locatie: `renderSpieren` (subtitel) + kleurschaal in het Plan-overzicht.
- Type: dose-response-richtlijn.
- Kandidaat-bron (ONGEVERIFIEERD): Schoenfeld, Ogborn, Krieger (2017) dose-response meta-analyse volume↔hypertrofie; Baz-Valle et al. reviews. Let op: **MEV/MRV**-terminologie (Israetel / Renaissance Periodization) is populair maar niet per se peer-reviewed.
- Verwacht niveau: A–B (meer volume → meer hypertrofie tot een plateau), maar de exacte band 10–20 is deels praktijk.
- Vragen: onderbouwing ondergrens/bovengrens; individuele variatie; telt de app "hard sets" of álle werksets? (relevant voor de vergelijking met de richtlijn).

**C6 — Dubbele progressie**
- Claim: haal je de bovenkant van het rep-bereik → gewicht omhoog; anders reps +1.
- Locatie: `renderSuggesties`.
- Type: programmeer-principe (operationalisering van progressive overload).
- Verwacht niveau: A voor *progressive overload* als principe; B–D voor *deze specifieke* progressie-implementatie.
- Vragen: bestaat er direct vergelijkend bewijs voor double-progression vs. andere modellen?

**C7 — Rep-caps & increments**
- Claim: compound rep-cap 8, isolatie 12; gewichtstap 2,5 kg (≥40 kg) / 1 kg (15–40) / 0,5 kg (<15).
- Locatie: `renderSuggesties`.
- Type: app-specifieke vuistregel.
- Verwacht niveau: D. Vragen: zijn deze stappen realistisch (microloading-praktijk)?

**C8 — Werkgewicht-formule in het Plan**
- Claim: `werkgewicht ≈ e1RM / (1 + onderkant_reps/30) × 0,88`, per week + 2,5 (compound) / 1,25 (isolatie) kg.
- Locatie: `planTarget()` (~r.822).
- Type: heuristiek (C1 + 88%-buffer + lineaire wekelijkse progressie).
- Verwacht niveau: D. Vragen: is 0,88 een redelijke intensiteit voor de ónderkant van het rep-bereik? Relatie met RPE/RIR (bijv. Helms et al.)? Is wekelijks lineair toevoegen realistisch over 6–12 weken?

**C9 — Push/Pull-balans**
- Claim: ratio push/pull ~1; >1,25 "veel duwen", <0,8 "veel trekken".
- Locatie: `renderSpieren`.
- Type: balans-/blessurepreventie-lore.
- Verwacht niveau: waarschijnlijk C–D (zwak). Vragen: bestaat er uitkomst-bewijs (blessure/houding/prestatie) voor een specifieke push:pull-ratio, of is dit vooral coach-conventie?

**C10 — Plateau- & trenddetectie**
- Claim: plateau = max e1RM laatste 3 wk ≤ 1,002 × max e1RM de 3 wk daarvoor (≤0,2% winst); Trend = zelfde 3-vs-3-weken-venster.
- Locatie: `renderProgressie` (trend), `renderSuggesties` (plateau).
- Type: eigen statistische drempel.
- Verwacht niveau: E→beoordelen. Vragen: wat is de normale **dag-tot-dag variatie** in gemeten/geschatte 1RM (ruis)? Is een 0,2%-drempel over 3 weken te gevoelig → vals-positieve "plateaus"? Aanbeveling voor een robuustere maat?

### C. Normwaarden

**C11 — Krachtstandaarden (× lichaamsgewicht)**
- Claim: vaste ratio-drempels per geslacht voor Bench/Squat/Deadlift → niveau Beginner…Elite.
- Locatie: `STD` object (~r.713) in `renderBenchmark`.
- Type: normatieve tabel.
- Kandidaat-bron (ONGEVERIFIEERD): commerciële/coaching-normen (bijv. strengthlevel.com, ExRx.net, Lon Kilgore). **Niet peer-reviewed.**
- Verwacht niveau: D. Vragen: waar komen deze exacte getallen vandaan, en op welke steekproef? 
- **Belangrijke nuance**: de ratio negeert **lichaamsgewichtsschaling** (zwaardere lifters hebben lagere kg/kg; vergelijk Wilks/DOTS/IPF-punten) en **leeftijd** → structureel oneerlijk tussen gewichtsklassen.

**C12 — Geslacht binair, geen leeftijd**
- Claim: keuze man/vrouw; geen leeftijdscorrectie.
- Type: aanname. Vraag/nuance: normen variëren met leeftijd; documenteer de beperking.

### D. Meet-aannames

**C13 — Volume = last × reps (tonnage)**
- Claim: "Totaal volume" en volume-grafieken = Σ gewicht × reps.
- Locatie: `setVolT`, `renderOverzicht`.
- Type: meetkeuze.
- Kandidaat-bron (ONGEVERIFIEERD): recente consensus gebruikt "**aantal hard sets**" als betere proxy voor hypertrofie-stimulus dan tonnage (Schoenfeld/Krieger). 
- Vraag: is tonnage hier verdedigbaar als globale werklast-indicator, met de kanttekening dat de spiergroep-analyse wél sets telt (dus consistent met de literatuur)?

**C14 — Lichaamsgewicht/cardio = 0 kg volume** — aanname/limiet; check dat dit de sets-per-spiergroep-telling niet vertekent (die telt sets, niet tonnage → oké).

**C15 — e1RM als universele "score" voor alle gewicht-lifts** — nuance: minder betrouwbaar bij hoge reps en technische (olympische) lifts.

**C16 — Spiergroep-classificatie op naam (`muscleOf`)** — heuristiek, geen EMG/biomechanica. Check grove correctheid en edge-cases (dips = borst/triceps, rows = rug, rear-delt = schouder-achter, hip thrust = glutes/hamstrings).

---

## 5. Output-sjabloon (per claim invullen)

```
## Cn — <korte titel>
- Formule-check:        <klopt / afwijking>
- Bron (geverifieerd):  <auteur, jaar, tijdschrift> — DOI/PMID <...>
                        verifyCitation: <matched/mismatch/ambiguous/not_found>
                        checkRetraction: <clean/retracted/...>
- Bewijsniveau:         <A–E>   Confidence: <laag/midden/hoog>
- Toepassingsgrenzen:   <wanneer klopt de claim niet>
- Oordeel:              <Correct / Correct-met-nuance / Vereenvoudiging / Onjuist-Verouderd>
- Aanbeveling:          <concrete tekst-/code-wijziging of "geen">
```

Eindproduct: een tabel met alle `Cn` + oordeel + confidence, en een korte lijst
"aanbevolen wijzigingen aan de app" (gesorteerd op prioriteit).

---

## 6. Hoe te gebruiken (prompt voor de verificatie-agent)

> Je bent een exercise-science-verificator. Werk `SCIENCE-BLUEPRINT.md` claim voor claim af
> volgens het protocol in §1. Zoek voor elke claim de primaire literatuur, en **verifieer elk
> citaat met Scholar Sidekick (`verifyCitation`, `checkRetraction`) vóór je het vertrouwt** —
> de kandidaat-bronnen in het blueprint zijn expliciet ongeverifieerd. Vul het sjabloon uit §5
> in, geef per claim een bewijsniveau (A–E) en een oordeel, en sluit af met een geprioriteerde
> lijst aanbevolen wijzigingen. Verzin nooit een DOI, titel of jaartal; bij twijfel: `not_found`.

## 7. Belangrijke waarschuwing over citaat-fabricatie
De dominante AI-fout is een **echte DOI met een verzonnen titel** — die "resolvet" prima, dus
"de link werkt" bewijst niets. Gebruik altijd `verifyCitation` (titel ↔ record). Behandel elke
bron in dit document als een *hypothese*, niet als bewijs.
