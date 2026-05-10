import { supabase } from "./supabase";
import { extractLegalEntities } from "./claude";
import type { LegalChunk } from "@/types";

export async function retrieveRelevantChunks(
  draftText: string,
  limit = 15
): Promise<LegalChunk[]> {
  const entities = await extractLegalEntities(draftText);
  const queryText = [draftText.slice(0, 500), ...entities].join(" ");

  // Vector similarity search via Supabase RPC
  const { data, error } = await supabase.rpc("match_legal_chunks", {
    query_text: queryText,
    match_count: limit,
  });

  if (error) throw new Error(`Retrieval failed: ${error.message}`);
  return (data ?? []) as LegalChunk[];
}
