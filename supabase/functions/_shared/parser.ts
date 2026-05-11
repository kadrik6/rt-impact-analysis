/**
 * Shared RT XML parser for Deno Edge Functions.
 * Handles both structured seadused (<paragrahv>) and simple määrused (<HTMLKonteiner>).
 */

export interface Chunk {
  paragraph_nr: string;
  content_et: string;
  act_title: string;
  rt_identifier: string;
  ministry_owner: string;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function extractText(xmlFragment: string): string {
  const tavatekst = xmlFragment.match(/<tavatekst>([\s\S]*?)<\/tavatekst>/);
  if (tavatekst) return tavatekst[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const cdata = xmlFragment.match(/<!\[CDATA\[([\s\S]*?)\]\]>/);
  if (cdata) return stripHtml(cdata[1]);
  return stripHtml(xmlFragment);
}

export function parseActXml(
  xml: string,
  actTitle: string,
  rtIdentifier: string,
  ministryOwner: string
): Chunk[] {
  if (xml.includes("<paragrahv ")) {
    return parseStructured(xml, actTitle, rtIdentifier, ministryOwner);
  }
  return parseHtml(xml, actTitle, rtIdentifier, ministryOwner);
}

function parseStructured(
  xml: string,
  actTitle: string,
  rtIdentifier: string,
  ministryOwner: string
): Chunk[] {
  const chunks: Chunk[] = [];
  const paraRegex = /<paragrahv [^>]*>([\s\S]*?)<\/paragrahv>/g;
  let m: RegExpExecArray | null;

  while ((m = paraRegex.exec(xml)) !== null) {
    const block = m[1];
    const nrMatch = block.match(/<paragrahvNr>(\d+[a-z]?)<\/paragrahvNr>/);
    const titleMatch = block.match(/<paragrahvPealkiri>([\s\S]*?)<\/paragrahvPealkiri>/);
    if (!nrMatch) continue;

    const nr = nrMatch[1];
    const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, "").trim() : "";

    // Collect all lõige texts
    const loigeTexts: string[] = [];
    const loigeRegex = /<loige [^>]*>([\s\S]*?)<\/loige>/g;
    let lg: RegExpExecArray | null;
    while ((lg = loigeRegex.exec(block)) !== null) {
      const lNrMatch = lg[1].match(/<loigeNr>(\d+)<\/loigeNr>/);
      const text = extractText(lg[1]);
      if (text.length > 5) {
        loigeTexts.push(lNrMatch ? `(${lNrMatch[1]}) ${text}` : text);
      }
    }

    const content = [title, ...loigeTexts].filter(Boolean).join(" ").trim();
    if (content.length < 20) continue;

    chunks.push({
      paragraph_nr: `§ ${nr}`,
      content_et: content,
      act_title: actTitle,
      rt_identifier: rtIdentifier,
      ministry_owner: ministryOwner,
    });
  }

  return chunks;
}

function parseHtml(
  xml: string,
  actTitle: string,
  rtIdentifier: string,
  ministryOwner: string
): Chunk[] {
  const chunks: Chunk[] = [];
  const cdataBlocks = [...xml.matchAll(/<!\[CDATA\[([\s\S]*?)\]\]>/g)].map((m) => m[1]);
  const html = cdataBlocks.join("\n");
  const sections = html.split(/(?=<[^>]*>\s*<b>\s*§\s*\d)/);

  for (const section of sections) {
    const nrMatch = section.match(/<b>[^§]*§\s*(\d+[a-z]?)\./i);
    if (!nrMatch) continue;
    const text = stripHtml(section);
    if (text.length < 20) continue;

    chunks.push({
      paragraph_nr: `§ ${nrMatch[1]}`,
      content_et: text,
      act_title: actTitle,
      rt_identifier: rtIdentifier,
      ministry_owner: ministryOwner,
    });
  }

  return chunks;
}

export function extractActMeta(xml: string): {
  rt_identifier: string;
  effective_from: string | null;
  keywords: string[];
} {
  const rtOsaMatch = xml.match(/<RTosa>(.*?)<\/RTosa>/);
  const rtAastaMatch = xml.match(/<RTaasta>(.*?)<\/RTaasta>/);
  const rtNrMatch = xml.match(/<RTnr>(.*?)<\/RTnr>/);
  const rtArtikkelMatch = xml.match(/<RTartikkel>(.*?)<\/RTartikkel>/);
  const joustumineMatch = xml.match(/<joustumine>(.*?)<\/joustumine>/);

  const rt_identifier =
    rtOsaMatch && rtAastaMatch && rtNrMatch && rtArtikkelMatch
      ? `${rtOsaMatch[1]} ${rtAastaMatch[1]}, ${rtNrMatch[1]}, ${rtArtikkelMatch[1]}`
      : "";

  const effective_from = joustumineMatch
    ? joustumineMatch[1].split("+")[0].split("T")[0]
    : null;

  const marksona: string[] = [];
  const marksonaRegex = /<marksona>(.*?)<\/marksona>/g;
  // handles array of marksona elements
  const markBlock = xml.match(/<marksona>([\s\S]*?)<\/marksona>/g) ?? [];
  for (const mk of markBlock) {
    marksona.push(mk.replace(/<[^>]+>/g, "").trim());
  }

  return { rt_identifier, effective_from, keywords: marksona };
}
