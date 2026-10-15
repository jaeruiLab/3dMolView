/** Levenshtein edit distance (insertions, deletions, substitutions), O(n·m) time, O(m) space. */
export function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min((previous[j] ?? 0) + 1, (current[j - 1] ?? 0) + 1, (previous[j - 1] ?? 0) + cost);
    }
    previous = current;
  }
  return previous[b.length] ?? 0;
}

/**
 * Whether `candidate` is a plausible correction of `query`: a few typos away, or a
 * completion of a truncated query ("ibupro" → "ibuprofen"). Used to drop PubChem
 * autocomplete results that are unrelated to what was typed.
 */
export function isPlausibleCorrection(query: string, candidate: string): boolean {
  const q = query.trim().toLowerCase();
  const c = candidate.trim().toLowerCase();
  if (q === c) return false;
  if (q.length >= 4 && c.startsWith(q)) return true;
  const allowed = Math.max(2, Math.ceil(q.length * 0.34));
  return editDistance(q, c) <= allowed;
}
