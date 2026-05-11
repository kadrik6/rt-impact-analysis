import { XMLParser } from "fast-xml-parser";

const p = new XMLParser({
  ignoreAttributes: false,
  cdataPropName: "__cdata",
  isArray: (n) => ["paragrahv", "loige"].includes(n),
});

const res = await fetch("https://www.riigiteataja.ee/akt/13198475.xml");
const xml = await res.text();
const parsed = p.parse(xml) as Record<string, unknown>;
const oigusakt = parsed["oigusakt"] as Record<string, unknown>;
const meta = oigusakt?.["metaandmed"] as Record<string, unknown>;
console.log("All metaandmed keys and values:");
for (const [k, v] of Object.entries(meta ?? {})) {
  console.log(` ${k}: ${JSON.stringify(v)}`);
}
