export type ImpactType = "conflict" | "amendment_required" | "cross_reference" | "obsolete";
export type AnalysisMode = "deterministic" | "ai" | "hybrid" | "agentic";

export type MinistrySource = "eis" | "rt_metadata" | "draft_committee" | "rule_based";
export type MinistryConfidence = "high" | "medium" | "low";

export interface MinistryHint {
  name: string;
  source: MinistrySource;
  confidence: MinistryConfidence;
  keywords?: string[];
  note?: string;
}

export interface NoiseAct {
  act_title: string;
  reason_excluded: string;
}

export interface AffectedAct {
  act_title: string;
  rt_identifier: string;
  reason: string;
  relevance_check?: string;         // CoT reasoning from AI
  category?: "A" | "B" | "C";      // A=direct, B=substantive, C=noise (shown collapsed)
  directly_amended?: boolean;        // true when draft title explicitly names this act
  paragraphs: string[];
  ministry: string;               // kept for backward compat — use ministryHints when available
  ministryHints?: MinistryHint[];
  impact_type: ImpactType;
  confidence: number;
  rt_url: string;
  confirmed?: boolean | null;
  keyword_hits?: string[];
  risk_score?: number;
}

export interface ImpactAnalysis {
  mode: AnalysisMode;
  affected_acts: AffectedAct[];
  noise_acts?: NoiseAct[];          // AI-identified terminological noise
  draft_focus?: string;             // AI one-line summary of the draft's purpose
  conflicts_found: string[];
  // Replaces ministries_to_notify — richer structure
  possible_bodies?: MinistryHint[];
  // Kept for backward compat
  ministries_to_notify: string[];
  unresolved: string;
  generated_at: string;
  acts_analysed: string[];
  paragraphs_retrieved: number;
  from_cache?: boolean;
  model_used?: string;
  input_tokens?: number;
  output_tokens?: number;
  estimated_cost_usd?: number;
  prompt_preview?: string;
  estimated_input_tokens?: number;
  ai_available?: boolean;
  tool_calls_made?: number;
}

export interface LegalChunk {
  id: string;
  act_id: string;
  act_title: string;
  act_type: string;
  paragraph_nr: string;
  content_et: string;
  ministry_owner: string;
  effective_from: string;
  last_amended: string;
  rt_identifier: string;
  keywords: string[];
}
