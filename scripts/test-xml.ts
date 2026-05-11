import { XMLParser } from "fast-xml-parser";

const parser = new XMLParser({
  ignoreAttributes: false,
  cdataPropName: "__cdata",
  isArray: (n) => ["paragrahv", "loige"].includes(n),
});

const res = await fetch("https://www.riigiteataja.ee/akt/13198475.xml");
const xml = await res.text();

const isStructured = xml.includes("<paragrahv ");
const paragrahvCount = (xml.match(/<paragrahv /g) ?? []).length;

console.log("Format:", isStructured ? "structured <paragrahv>" : "html HTMLKonteiner");
console.log("Paragrahv elements:", paragrahvCount);

if (isStructured) {
  const sample = xml.slice(xml.indexOf("<paragrahv "), xml.indexOf("<paragrahv ") + 500);
  console.log("\nFirst <paragrahv> block:\n", sample);
} else {
  const cdata = xml.match(/<!\[CDATA\[([\s\S]{0,400})/)?.[1] ?? "";
  console.log("\nFirst CDATA block:\n", cdata);
}

// Also check metaandmed
const parsed = parser.parse(xml) as Record<string, unknown>;
const meta = (parsed?.["oigusakt"] as Record<string, unknown>)?.["metaandmed"] as Record<string, unknown>;
console.log("\nMetaandmed keys:", meta ? Object.keys(meta).slice(0, 10) : "not found");
