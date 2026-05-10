/**
 * Deterministic (zero-cost) impact analysis layer.
 * Runs entirely on keyword scoring — no API calls.
 */

import type { Chunk } from "./parser.ts";

export type ImpactType = "conflict" | "amendment_required" | "cross_reference" | "obsolete";
export type MinistrySource = "eis" | "rt_metadata" | "draft_committee" | "rule_based";
export type MinistryConfidence = "high" | "medium" | "low";

export interface MinistryHint {
  name: string;
  source: MinistrySource;
  confidence: MinistryConfidence;
  keywords: string[];
  note: string;
}

export interface ScoredAct {
  act_title: string;
  rt_identifier: string;
  ministry: string;           // raw guessed name, kept for compat
  ministryHints: MinistryHint[];
  paragraphs: string[];
  impact_type: ImpactType;
  confidence: number;
  reason: string;
  keyword_hits: string[];
  risk_score: number;
  // A = act title words appear directly in draft; B = keyword/domain match only
  category: "A" | "B";
  // true when the draft title explicitly names this act as being amended/repealed
  directly_amended?: boolean;
}

// Weighted keyword dictionary.
// DESIGN PRINCIPLE: only terms that are domain-specific enough to distinguish laws.
// Generic procedural terms ("menetlus", "tähtaeg", "taotlus", "peab", "asutus",
// "töötaja", "palk", "puhkus", "leping", "tasu", "andmed") are intentionally omitted —
// they appear in almost every law and produce terminological false positives.
const KEYWORD_WEIGHTS: Record<string, number> = {
  // Criminal / enforcement — highest specificity
  trahv: 5, sanktsioon: 5, väärtegu: 5, kuritegu: 5,

  // Gambling / betting — domain-specific
  hasartmäng: 6, loterii: 5, kihlvedu: 5, kasiino: 5,

  // Tax — specific enough when paired with other signals
  käibemaks: 5, tulumaks: 5, aktsiis: 4, riigieelarve: 3, eelarve: 2,
  maks: 2,  // weight 2 — too generic alone, needs companions

  // Data / registers
  isikuandmed: 4, andmekaitse: 4, andmekogu: 4, register: 3,

  // Liability / obligations — meaningful when domain-paired
  vastutus: 4, kohustus: 3, keeld: 3, nõue: 3, nõuded: 3,

  // Oversight — only counts if domain matches
  järelevalve: 3, audit: 3, inspektsioon: 3,

  // Administration — specific enough
  ametiisik: 3, haldusorgan: 3,

  // Social / labour — high specificity for employment law
  töölepingu: 4, tööandja: 3, töötasu: 3,
  hüvitis: 3, toetus: 2,

  // Procurement
  riigihanke: 4, hanke: 3, konkurss: 2,

  // Permits
  luba: 2, teatis: 2,
};

// Keywords considered "meaningful" — must have weight >= this to qualify an act
const MEANINGFUL_WEIGHT_THRESHOLD = 3;

// High-specificity domain anchor keywords.
// When the draft contains ANY of these, acts that share NONE of them are filtered out.
// Prevents cross-domain false positives (e.g. a hasartmäng draft matching military service law).
const DOMAIN_ANCHOR_KEYWORDS: string[] = [
  // Gambling
  "hasartmäng", "loterii", "kihlvedu", "kasiino",
  // Tax (specific forms)
  "käibemaks", "tulumaks", "aktsiis",
  // Data protection
  "isikuandmed", "andmekaitse",
  // Defence / military
  "kaitsevägi", "riigikaitse",
  // Criminal
  "kriminaalmenetlus", "väärtegu",
  // Procurement
  "riigihanke",
];

// Stopwords ignored when matching act title words against draft text
const TITLE_STOPWORDS = new Set([
  "seadus", "seaduse", "seadust", "seadusega", "seadusse",
  "määrus", "määruse", "määrust",
  "rakendamise", "rakendamine",
  "muutmise", "muutmine",
  "eelnõu", "seoses", "kohta",
]);

/**
 * Parses an Estonian draft title and returns the names of laws that are directly
 * being amended or repealed.
 *
 * Examples:
 *   "Hasartmängumaksu seaduse muutmine"          → ["Hasartmängumaksu seadus"]
 *   "Tulumaksuseaduse ja käibemaksuseaduse muutmine" → ["Tulumaksuseadus", "Käibemaksuseadus"]
 *   "Töölepingu seaduse kehtetuks tunnistamine"  → ["Töölepingu seadus"]
 */
export function extractAmendedActNames(draftTitle: string): string[] {
  if (!draftTitle) return [];

  // Strip trailing action phrases that are NOT part of the law name
  const actionSuffixes = [
    /\s+kehtetuks tunnistamise seadus\.?$/i,
    /\s+kehtetuks tunnistamine\.?$/i,
    /\s+muutmise seadus\.?$/i,
    /\s+muutmine\.?$/i,
    /\s+rakendamise seadus\.?$/i,
    /\s+rakendamine\.?$/i,
    /\s+eelnõu\.?$/i,
  ];
  let cleaned = draftTitle.trim();
  for (const re of actionSuffixes) cleaned = cleaned.replace(re, "");

  // Split on conjunctions between law references (e.g. "X seaduse ja Y seaduse")
  // Pattern: split on " ja " that is followed by a capitalised word (start of next law name)
  const parts = cleaned.split(/\s+ja\s+(?=[A-ZÜÕÖÄ])/);

  const results: string[] = [];
  for (const part of parts) {
    // Match "<Name> seaduse|määruse|koodeksi" → produce "<Name> seadus|määrus|koodeks"
    const m = part.match(/^(.+?)\s+(seaduse|seadust|määruse|määrust|koodeksi)$/i);
    if (m) {
      const base = m[1].trim();
      const nominative = m[2].toLowerCase().startsWith("seadus") ? "seadus"
        : m[2].toLowerCase().startsWith("määrus") ? "määrus"
        : "koodeks";
      results.push(`${base} ${nominative}`);
    } else if (part.trim()) {
      // Fallback: use as-is if it looks like a law name (contains "seadus" etc.)
      const fallback = part.trim();
      if (/seadus|määrus|koodeks/i.test(fallback)) results.push(fallback);
    }
  }

  return results;
}

// Ministry rules: each entry has the ministry name, trigger keywords, and confidence tier
const MINISTRY_RULES: Array<{
  name: string;
  lyhendMap: string[];
  titleKeywords: string[];
  triggerKeywords: string[];
  confidence: MinistryConfidence;
}> = [
  {
    name: "Sotsiaalministeerium",
    lyhendMap: ["TLS", "TTOS", "SHS", "PKS", "RaKS"],
    titleKeywords: ["töölepingu", "sotsiaalhoolekande", "ravikindlustus", "tööturu", "pension", "puuetega", "töövõime"],
    triggerKeywords: ["töötaja", "tööandja", "töötasu", "palk", "puhkus", "tööleping", "sotsiaalmaks", "haigushüvitis"],
    confidence: "medium",
  },
  {
    name: "Justiitsministeerium",
    lyhendMap: ["ÄS", "AvTS", "IKS", "TsMS", "KrMS", "VangS", "AdvS"],
    titleKeywords: ["äriseadustik", "andmekaitse", "kohtutäitur", "karistus", "kriminaal", "vangla", "notari", "pankroti"],
    triggerKeywords: ["isikuandmed", "andmekaitse", "register", "andmekogu", "kohus", "menetlus"],
    confidence: "medium",
  },
  {
    name: "Rahandusministeerium",
    lyhendMap: ["ATS", "RHS", "MKS", "RES", "MSOS"],
    titleKeywords: ["riigieelarve", "maksukorraldus", "hange", "aktsiisi", "tolli", "riigivaraseadus"],
    triggerKeywords: ["maks", "eelarve", "hange", "riigihanke", "aktsiis", "toll", "riigieelarve"],
    confidence: "medium",
  },
  {
    name: "Haridus- ja Teadusministeerium",
    lyhendMap: ["HaS", "ÜKS", "KutÕS"],
    titleKeywords: ["haridus", "ülikool", "kutseõppe", "õppetoetus", "teadus"],
    triggerKeywords: ["haridus", "kool", "ülikool", "õpilane", "õpetaja", "õppe"],
    confidence: "medium",
  },
  {
    name: "Kliimaministeerium",
    lyhendMap: ["KKS", "EhS", "PlanS", "JäätS", "VeeS"],
    titleKeywords: ["ehitus", "keskkond", "planeerimine", "kliima", "jäätme", "veeseadus"],
    triggerKeywords: ["ehitus", "keskkond", "kliima", "jäätme", "planeerimine", "saaste"],
    confidence: "medium",
  },
  {
    name: "Siseministeerium",
    lyhendMap: ["VS", "PGS", "VMS", "KRLS"],
    titleKeywords: ["politsei", "piirivalve", "kohalik omavalitsus", "välismaalaste", "kodakondlus"],
    triggerKeywords: ["politsei", "piirivalve", "elanik", "kohalik omavalitsus", "KOV", "vald", "linn"],
    confidence: "medium",
  },
  {
    name: "Kaitseministeerium",
    lyhendMap: ["KVTS", "KaitseS", "RiKS"],
    titleKeywords: ["kaitseväe", "riigikaitse", "sõjaväe"],
    triggerKeywords: ["kaitsevägi", "riigikaitse", "sõjavägi", "kaitse"],
    confidence: "medium",
  },
  {
    name: "Regionaal- ja Põllumajandusministeerium",
    lyhendMap: ["MaaRS", "MÕKS", "ToiduS"],
    titleKeywords: ["põllumajandus", "metsaseadus", "toiduseadus", "veterinaar"],
    triggerKeywords: ["põllumajandus", "mets", "toit", "veterinaar", "maa"],
    confidence: "medium",
  },
  {
    name: "Kultuuriministeerium",
    lyhendMap: ["KAS", "TRKS", "SpTS"],
    titleKeywords: ["kultuur", "muuseum", "sport", "ringhääling", "trükis"],
    triggerKeywords: ["kultuur", "sport", "muuseum", "arhiiv", "ringhääling"],
    confidence: "medium",
  },
  {
    name: "Majandus- ja Kommunikatsiooniministeerium",
    lyhendMap: ["MeS", "ÜTS", "ETS"],
    titleKeywords: ["transport", "raudtee", "lennundus", "merendus", "energiaseadus", "elektriturg", "infoühiskond"],
    triggerKeywords: ["transport", "raudtee", "lennundus", "merendus", "energia", "elekter", "side"],
    confidence: "medium",
  },
];

export function deriveMinistryHints(
  lyhend: string,
  actTitle: string,
  contentKeywords: string[]   // keyword_hits from scoring
): MinistryHint[] {
  const hints: MinistryHint[] = [];
  const titleLower = actTitle.toLowerCase();
  const lyhendUpper = lyhend.toUpperCase();

  for (const rule of MINISTRY_RULES) {
    const triggeredKeywords: string[] = [];
    let conf = rule.confidence;
    let source: MinistrySource = "rule_based";
    let matched = false;

    // Lyhend map match — strongest signal
    if (rule.lyhendMap.includes(lyhendUpper)) {
      triggeredKeywords.push(`lühend: ${lyhend}`);
      conf = "high";
      matched = true;
    }

    // Title keyword match
    for (const kw of rule.titleKeywords) {
      if (titleLower.includes(kw)) {
        triggeredKeywords.push(`pealkiri: "${kw}"`);
        matched = true;
      }
    }

    // Content keyword match — lowest confidence
    for (const kw of rule.triggerKeywords) {
      if (contentKeywords.includes(kw)) {
        triggeredKeywords.push(`sisu: "${kw}"`);
        matched = true;
        if (conf === "medium") conf = "medium"; // already medium, keep
      }
    }

    if (!matched) continue;

    // Downgrade if only content match and no title/lyhend signal
    const hasStrongSignal = rule.lyhendMap.includes(lyhendUpper) ||
      rule.titleKeywords.some((kw) => titleLower.includes(kw));
    if (!hasStrongSignal) conf = "low";

    hints.push({
      name: rule.name,
      source,
      confidence: conf,
      keywords: triggeredKeywords.slice(0, 4),
      note: "Tuvastatud sisu põhjal. Kontrolli EIS-i toimikut ja seletuskirja.",
    });
  }

  // Deduplicate by name, keep highest confidence
  const seen = new Map<string, MinistryHint>();
  for (const h of hints) {
    const existing = seen.get(h.name);
    if (!existing) { seen.set(h.name, h); continue; }
    const order: MinistryConfidence[] = ["high", "medium", "low"];
    if (order.indexOf(h.confidence) < order.indexOf(existing.confidence)) {
      seen.set(h.name, h);
    }
  }

  return [...seen.values()].sort((a, b) => {
    const order: MinistryConfidence[] = ["high", "medium", "low"];
    return order.indexOf(a.confidence) - order.indexOf(b.confidence);
  });
}

// Impact type detection patterns
const CONFLICT_PATTERNS = [
  /muudetakse|tunnistatakse kehtetuks|asendatakse|tühistatakse/i,
  /vastuolus|ei kehti|kaotab kehtivuse/i,
];
const AMENDMENT_PATTERNS = [
  /täiendatakse|lisatakse|kehtestatakse|rakendatakse/i,
  /uus nõue|uus kohustus|muutub kohustuslikuks/i,
];
const CROSS_REF_PATTERNS = [/\b(seaduse|seadust|määruse|määrust)\s+§/i, /kooskõlas\s+\w+\s+seadusega/i];
const OBSOLETE_PATTERNS = [/kehtetuks tunnistamine|kehtetu|asendab/i];

function detectImpactType(draftText: string, actText: string): ImpactType {
  const combined = draftText + " " + actText;
  if (CONFLICT_PATTERNS.some((p) => p.test(combined))) return "conflict";
  if (OBSOLETE_PATTERNS.some((p) => p.test(draftText))) return "obsolete";
  if (AMENDMENT_PATTERNS.some((p) => p.test(draftText))) return "amendment_required";
  if (CROSS_REF_PATTERNS.some((p) => p.test(draftText))) return "cross_reference";
  return "amendment_required";
}

function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[a-züõöä]{3,}/g) ?? [];
}

function scoreText(tokens: Set<string>): { score: number; hits: string[] } {
  let score = 0;
  const hits: string[] = [];
  for (const [kw, weight] of Object.entries(KEYWORD_WEIGHTS)) {
    if (tokens.has(kw) || [...tokens].some((t) => t.includes(kw))) {
      score += weight;
      hits.push(kw);
    }
  }
  return { score, hits };
}

export function deterministicAnalysis(
  chunks: Chunk[],
  draftText: string
): ScoredAct[] {
  const draftTokens = new Set(tokenize(draftText));

  // Domain anchors present in the draft — used to reject cross-domain acts
  const draftAnchors = DOMAIN_ANCHOR_KEYWORDS.filter(
    (anchor) => draftTokens.has(anchor) || [...draftTokens].some((t) => t.includes(anchor))
  );
  const hasDraftDomain = draftAnchors.length > 0;

  const byAct = new Map<string, Chunk[]>();
  for (const c of chunks) {
    const key = c.act_title;
    if (!byAct.has(key)) byAct.set(key, []);
    byAct.get(key)!.push(c);
  }

  const results: ScoredAct[] = [];

  for (const [actTitle, actChunks] of byAct) {
    // Skip purely procedural chunks — they inflate token overlap with no domain signal
    const substantiveChunks = actChunks.filter((c) => {
      const lower = c.content_et.toLowerCase();
      return !(
        lower.startsWith("käesolev seadus jõustub") ||
        lower.startsWith("käesolevat seadust rakendatakse") ||
        lower.startsWith("käesoleva seaduse rakendamiseks") ||
        (lower.includes("jõustub") && lower.includes("päeval") && lower.length < 250)
      );
    });
    if (substantiveChunks.length === 0) continue;

    const actTokens = new Set(substantiveChunks.flatMap((c) => tokenize(c.content_et)));

    // Domain gate: if the draft belongs to a specific domain (hasartmäng, käibemaks, …),
    // acts that share none of those domain anchors are cross-domain noise — skip them.
    if (hasDraftDomain) {
      const actMatchesDomain = draftAnchors.some(
        (anchor) => actTokens.has(anchor) || [...actTokens].some((t) => t.includes(anchor))
      );
      if (!actMatchesDomain) continue;
    }

    const { score: kwScore, hits: kwHits } = scoreText(actTokens);

    // Overlap counts only tokens ≥ 6 chars — excludes short generic words like
    // "maks"(4), "tasu"(4), "keeld"(5) that appear in almost every law.
    const meaningfulOverlap = [...draftTokens].filter((t) => t.length >= 6 && actTokens.has(t)).length;

    const rawScore = meaningfulOverlap + kwScore;
    if (rawScore < 6) continue;

    // Quality gate: require at least one high-specificity keyword (weight ≥ 4)
    // OR at least two medium-specificity keywords (weight ≥ MEANINGFUL_WEIGHT_THRESHOLD).
    const uniqueHits = [...new Set(kwHits)];
    const highHits = uniqueHits.filter((h) => (KEYWORD_WEIGHTS[h] ?? 0) >= 4);
    const medHits = uniqueHits.filter((h) => (KEYWORD_WEIGHTS[h] ?? 0) >= MEANINGFUL_WEIGHT_THRESHOLD);
    if (highHits.length === 0 && medHits.length < 2) continue;

    // Paragraph ranking
    const matchedParagraphs: Array<{ nr: string; overlap: number }> = [];
    for (const chunk of substantiveChunks) {
      const chunkTokens = new Set(tokenize(chunk.content_et));
      const chunkOverlap = [...draftTokens].filter((t) => t.length >= 6 && chunkTokens.has(t)).length;
      const { score: chunkKw } = scoreText(chunkTokens);
      if (chunkOverlap > 0 || chunkKw > 2) {
        matchedParagraphs.push({ nr: chunk.paragraph_nr, overlap: chunkOverlap + chunkKw });
      }
    }
    matchedParagraphs.sort((a, b) => b.overlap - a.overlap);
    const topParagraphs = matchedParagraphs.slice(0, 3).map((p) => p.nr);

    const topHits = uniqueHits.slice(0, 5);
    const impactType = detectImpactType(draftText, substantiveChunks.map((c) => c.content_et).join(" "));

    // Category A: the act title contains a long compound word (≥ 8 chars) that also appears
    // in the draft text — strong evidence the draft explicitly discusses this act's subject.
    // One such hit is sufficient because Estonian compound words are domain-specific by nature
    // (e.g. "hasartmängumaksu" can only mean one thing).
    const titleWords = (actTitle.toLowerCase().match(/[a-züõöä]{4,}/g) ?? [])
      .filter((w) => !TITLE_STOPWORDS.has(w));
    const directTitleHits = titleWords.filter((w) => draftTokens.has(w)).length;
    const hasLongTitleHit = titleWords.some((w) => w.length >= 8 && draftTokens.has(w));
    const category: "A" | "B" = hasLongTitleHit || directTitleHits >= 2 ? "A" : "B";

    // Confidence: keyword quality score, with a floor for direct title matches so the
    // explicitly-mentioned act always appears as "high" relevance.
    let confidence = Math.min(0.88, rawScore / 30);
    if (category === "A") confidence = Math.max(0.72, confidence);

    const reasonParts: string[] = [];
    if (topHits.length) reasonParts.push(`Märksõnad: ${topHits.join(", ")}`);
    if (meaningfulOverlap > 0) reasonParts.push(`${meaningfulOverlap} ühist spetsiifilisemat terminit eelnõuga`);
    const reason = reasonParts.join(". ") || "Tekstiline kattuvus tuvastatud";

    const lyhend = substantiveChunks[0].rt_identifier.split(" ")[0] ?? "";
    const ministryHints = deriveMinistryHints(lyhend, actTitle, topHits);

    results.push({
      act_title: actTitle,
      rt_identifier: actChunks[0].rt_identifier,
      ministry: substantiveChunks[0].ministry_owner,
      ministryHints,
      paragraphs: topParagraphs,
      impact_type: impactType,
      confidence,
      reason,
      keyword_hits: topHits,
      risk_score: rawScore,
      category,
    });
  }

  results.sort((a, b) => b.risk_score - a.risk_score);
  return results;
}

export function buildPossibleBodies(acts: ScoredAct[]): MinistryHint[] {
  const seen = new Map<string, MinistryHint>();
  const order: Array<MinistryHint["confidence"]> = ["high", "medium", "low"];

  for (const act of acts) {
    for (const hint of act.ministryHints) {
      const existing = seen.get(hint.name);
      if (!existing || order.indexOf(hint.confidence) < order.indexOf(existing.confidence)) {
        seen.set(hint.name, hint);
      }
    }
  }

  return [...seen.values()].sort((a, b) => order.indexOf(a.confidence) - order.indexOf(b.confidence));
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3);
}

export function estimateCostUsd(inputTokens: number, outputTokens: number, model: string): number {
  const pricing: Record<string, { input: number; output: number }> = {
    "claude-haiku-4-5-20251001": { input: 0.80, output: 4.00 },
    "claude-sonnet-4-6": { input: 3.00, output: 15.00 },
    "claude-opus-4-7": { input: 15.00, output: 75.00 },
  };
  const p = pricing[model] ?? pricing["claude-haiku-4-5-20251001"];
  return (inputTokens * p.input + outputTokens * p.output) / 1_000_000;
}
