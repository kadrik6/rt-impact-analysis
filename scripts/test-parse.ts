/**
 * Dry-run: fetch töölepingu seadus, parse paragraphs, print sample.
 * No Supabase or HuggingFace needed.
 */
import { XMLParser } from "fast-xml-parser";

const RT_BASE = "https://www.riigiteataja.ee/akt";

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  cdataPropName: "__cdata",
  isArray: (n) => ["paragrahv", "loige"].includes(n),
});

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function getText(node: unknown): string {
  if (!node || typeof node !== "object") return String(node ?? "").trim();
  const n = node as Record<string, unknown>;
  if (n["tavatekst"]) return String(n["tavatekst"]).trim();
  if (n["__cdata"]) return stripHtml(String(n["__cdata"]));
  return Object.values(n).flatMap((v) => Array.isArray(v) ? v.map(getText) : [getText(v)]).join(" ").trim();
}

const res = await fetch(`${RT_BASE}/13198475.xml`);
const xml = await res.text();
const parsed = xmlParser.parse(xml) as Record<string, unknown>;

// Extract keywords
const meta = (parsed?.["oigusakt"] as Record<string, unknown>)?.["metaandmed"] as Record<string, unknown>;
const vastuvoetud = meta?.["vastuvoetud"] as Record<string, unknown>;
const keywords = Array.isArray(meta?.["marksona"]) ? meta["marksona"] : [];
const effectiveFrom = String(vastuvoetud?.["joustumine"] ?? "").split("+")[0];

console.log("Act: Töölepingu seadus");
console.log("Effective from:", effectiveFrom);
console.log("Keywords:", keywords);
console.log();

// Parse paragraphs
let count = 0;
function walk(node: unknown): void {
  if (!node || typeof node !== "object") return;
  const n = node as Record<string, unknown>;
  if (Array.isArray(n["paragrahv"])) {
    for (const para of n["paragrahv"] as Record<string, unknown>[]) {
      const nr = para["paragrahvNr"] ? `§ ${para["paragrahvNr"]}` : "";
      const title = para["paragrahvPealkiri"] ? String(para["paragrahvPealkiri"]) : "";
      const loiged = (para["loige"] ?? []) as Record<string, unknown>[];
      const text = [title, ...loiged.map(l => getText(l["sisuTekst"]))].filter(Boolean).join(" ");
      if (!nr || text.length < 20) continue;
      count++;
      if (count <= 3) {
        console.log(`[${nr}] ${title}`);
        console.log(`  ${text.slice(0, 120)}…`);
        console.log();
      }
    }
  }
  for (const v of Object.values(n)) {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") walk(v);
  }
}

walk(parsed);
console.log(`Total paragraphs parsed: ${count}`);
