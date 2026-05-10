// Client-side relevance scoring — no API calls, runs on every render cycle.
// Mirrors the domain-specificity logic in deterministic.ts:
// generic procedural terms ("menetlus", "tähtaeg", "peab", "asutus" etc.) are excluded
// because they appear in almost every law and produce false positives.

const LEGAL_KEYWORDS = new Set([
  // Criminal / enforcement
  "trahv", "sanktsioon", "väärtegu", "kuritegu",
  // Gambling
  "hasartmäng", "loterii", "kihlvedu", "kasiino",
  // Tax — specific variants
  "käibemaks", "tulumaks", "aktsiis", "riigieelarve",
  // Data
  "isikuandmed", "andmekaitse", "andmekogu", "register",
  // Liability / obligations (meaningful when domain-paired)
  "vastutus", "kohustus", "keeld", "nõue",
  // Oversight
  "järelevalve", "audit", "inspektsioon",
  // Administration — specific
  "ametiisik", "haldusorgan",
  // Labour — specific forms
  "töölepingu", "tööandja", "töötasu", "hüvitis",
  // Procurement
  "riigihanke", "hange",
  // Permits
  "luba", "teatis",
  // Domain markers
  "ehitus", "keskkond", "planeerimine", "haridus",
]);

export function tokenizeEt(text: string): Set<string> {
  return new Set(text.toLowerCase().match(/[a-züõöä]{3,}/g) ?? []);
}

/**
 * Score how relevant an act is to a draft, using the act title + lyhend as signal.
 * draftTokens should be pre-computed once per draft text (not per act).
 */
export function scoreActVsDraft(
  actTitle: string,
  actLyhend: string,
  draftTokens: Set<string>
): "high" | "medium" | null {
  if (draftTokens.size === 0) return null;

  let score = 0;
  const words = (actTitle + " " + actLyhend).toLowerCase().match(/[a-züõöä]{3,}/g) ?? [];

  for (const w of words) {
    if (draftTokens.has(w)) {
      score += LEGAL_KEYWORDS.has(w) ? 3 : 1;
    }
  }

  // Lyhend appearing literally in draft is a strong signal (e.g. "TLS § 28")
  if (actLyhend.length >= 2 && draftTokens.has(actLyhend.toLowerCase())) score += 4;

  if (score >= 5) return "high";
  if (score >= 2) return "medium";
  return null;
}

/**
 * Score how relevant a Riigikogu draft title is to a set of selected act titles.
 * Acts first flow: user selected acts, now browsing drafts.
 */
export function scoreDraftVsActs(
  draftTitle: string,
  actTitles: string[]
): "high" | "medium" | null {
  if (!actTitles.length) return null;

  const draftTokens = tokenizeEt(draftTitle);
  let maxScore = 0;

  for (const actTitle of actTitles) {
    let score = 0;
    const words = actTitle.toLowerCase().match(/[a-züõöä]{3,}/g) ?? [];
    for (const w of words) {
      if (draftTokens.has(w)) {
        score += LEGAL_KEYWORDS.has(w) ? 3 : 1;
      }
    }
    maxScore = Math.max(maxScore, score);
  }

  if (maxScore >= 5) return "high";
  if (maxScore >= 2) return "medium";
  return null;
}
