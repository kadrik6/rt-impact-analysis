import Anthropic from "@anthropic-ai/sdk";
import type { ImpactAnalysis } from "@/types";

const client = new Anthropic({
  apiKey: import.meta.env.VITE_ANTHROPIC_API_KEY,
  dangerouslyAllowBrowser: true,
});

const IMPACT_SYSTEM_PROMPT = `You are a legal analysis assistant for Estonian ministries.
You have deep knowledge of Estonian legislative structure: Riigi Teataja identifiers,
paragraph numbering conventions (§ X lg Y), and ministry domain ownership.

STRICT RULES — violating these makes the output useless:
1. Only cite paragraphs explicitly present in the provided RETRIEVED_CONTEXT
2. Never invent act names, RT identifiers, or paragraph numbers
3. If confidence < 0.7, add to "unresolved" instead of guessing
4. RT identifiers must follow exact format: "RT I, YYYY-MM-DD, NN" or "RT I YYYY, NN, MMM"
5. If insufficient evidence for a claim, say so explicitly in "unresolved"`;

const IMPACT_USER_TEMPLATE = (draft: string, context: string) => `
DRAFT LAW / PROPOSED AMENDMENT:
${draft}

RETRIEVED_CONTEXT (paragraphs from Riigi Teataja — cite only these):
${context}

Analyse the legislative impact. Return valid JSON matching this exact schema:
{
  "affected_acts": [
    {
      "act_title": "string",
      "rt_identifier": "string — must match RT format exactly",
      "reason": "one sentence why this act is affected",
      "paragraphs": ["§ X", "§ Y lg Z"],
      "ministry": "string",
      "impact_type": "conflict | amendment_required | cross_reference | obsolete",
      "confidence": 0.0
    }
  ],
  "conflicts_found": ["describe each direct legal conflict"],
  "ministries_to_notify": ["Ministry name"],
  "unresolved": "anything where evidence was insufficient for a confident citation"
}`;

export async function analyseImpact(
  draftText: string,
  retrievedChunks: Array<{ content_et: string; rt_identifier: string; paragraph_nr: string; act_title: string }>
): Promise<ImpactAnalysis> {
  const contextBlock = retrievedChunks
    .map((c) => `[${c.rt_identifier} | ${c.act_title} | ${c.paragraph_nr}]\n${c.content_et}`)
    .join("\n\n---\n\n");

  const message = await client.messages.create({
    model: "claude-opus-4-7",
    max_tokens: 4096,
    system: IMPACT_SYSTEM_PROMPT,
    messages: [{ role: "user", content: IMPACT_USER_TEMPLATE(draftText, contextBlock) }],
  });

  const raw = message.content[0].type === "text" ? message.content[0].text : "";
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Claude returned no valid JSON");

  const parsed = JSON.parse(jsonMatch[0]);

  return {
    ...parsed,
    generated_at: new Date().toISOString(),
    affected_acts: parsed.affected_acts.map((act: Omit<ImpactAnalysis["affected_acts"][number], "rt_url" | "confirmed">) => ({
      ...act,
      rt_url: `https://www.riigiteataja.ee/akt/${act.rt_identifier.replace(/[\s,]/g, "_")}`,
      confirmed: null,
    })),
  };
}

export async function extractLegalEntities(draftText: string): Promise<string[]> {
  const msg = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 512,
    messages: [{
      role: "user",
      content: `Extract legal search terms from this Estonian legislative text.
Return a JSON array of strings: act names, legal concepts, paragraph references.
Text: ${draftText.slice(0, 2000)}
Return only the JSON array, nothing else.`,
    }],
  });

  const raw = msg.content[0].type === "text" ? msg.content[0].text : "[]";
  try {
    return JSON.parse(raw.match(/\[[\s\S]*\]/)?.[0] ?? "[]");
  } catch {
    return [];
  }
}
