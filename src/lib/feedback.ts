const STORAGE_KEY = "rt-impact-feedback-v1";

export interface ExcludedAct {
  rt_identifier: string;
  act_title: string;
  excluded_at: string;
  count: number;
}

export function getExcludedActs(): ExcludedAct[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function recordExclusion(rt_identifier: string, act_title: string): ExcludedAct[] {
  const current = getExcludedActs();
  const existing = current.find((a) => a.rt_identifier === rt_identifier);
  if (existing) {
    existing.count++;
    existing.excluded_at = new Date().toISOString();
  } else {
    current.push({ rt_identifier, act_title, excluded_at: new Date().toISOString(), count: 1 });
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  return current;
}

export function clearExclusion(rt_identifier: string): ExcludedAct[] {
  const updated = getExcludedActs().filter((a) => a.rt_identifier !== rt_identifier);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  return updated;
}

export function clearAllExclusions(): void {
  localStorage.removeItem(STORAGE_KEY);
}
