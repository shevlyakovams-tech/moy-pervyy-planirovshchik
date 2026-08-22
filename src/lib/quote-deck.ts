import { randomInt } from "node:crypto";

export type QuoteCandidate = { id: string; category: string; author: string };
export type QuoteHistory = { quoteId: string; cycleNumber: number; author?: string; category?: string };
export type RandomIndex = (maxExclusive: number) => number;

const targetWeights: Record<string, number> = { HUMOR: 0.4, MOTIVATION: 0.3, PHILOSOPHY: 0.3 };

export function shuffled<T>(items: T[], randomIndex: RandomIndex = randomInt): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = randomIndex(index + 1);
    const current = result[index];
    const replacement = result[swap];
    if (current === undefined || replacement === undefined) continue;
    result[index] = replacement;
    result[swap] = current;
  }
  return result;
}

export function chooseQuote<T extends QuoteCandidate>(
  active: T[], history: QuoteHistory[], randomIndex: RandomIndex = randomInt
): { quote: T; cycleNumber: number } | null {
  if (active.length === 0) return null;
  const maxCycle = Math.max(1, ...history.map((item) => item.cycleNumber));
  const usedInCycle = new Set(history.filter((item) => item.cycleNumber === maxCycle).map((item) => item.quoteId));
  let cycleNumber = maxCycle;
  let remaining = active.filter((item) => !usedInCycle.has(item.id));
  let cycleHistory = history.filter((item) => item.cycleNumber === maxCycle);
  if (remaining.length === 0) {
    cycleNumber += 1;
    remaining = [...active];
    cycleHistory = [];
  }

  const shownCounts = cycleHistory.reduce<Record<string, number>>((counts, item) => {
    if (item.category) counts[item.category] = (counts[item.category] ?? 0) + 1;
    return counts;
  }, {});
  const position = cycleHistory.length + 1;
  const availableCategories = [...new Set(remaining.map((item) => item.category))];
  availableCategories.sort((left, right) => {
    const leftDeficit = (targetWeights[left] ?? 0) * position - (shownCounts[left] ?? 0);
    const rightDeficit = (targetWeights[right] ?? 0) * position - (shownCounts[right] ?? 0);
    return rightDeficit - leftDeficit;
  });
  const firstCategory = availableCategories[0];
  if (!firstCategory) return null;
  const bestDeficit = (targetWeights[firstCategory] ?? 0) * position - (shownCounts[firstCategory] ?? 0);
  const tied = availableCategories.filter((category) => ((targetWeights[category] ?? 0) * position - (shownCounts[category] ?? 0)) === bestDeficit);
  const category = tied[randomIndex(tied.length)] ?? firstCategory;
  const previousAuthor = cycleHistory.at(-1)?.author;
  const categoryCandidates = shuffled(remaining.filter((item) => item.category === category), randomIndex);
  const quote = categoryCandidates.find((item) => item.author !== previousAuthor) ?? categoryCandidates[0];
  return quote ? { quote, cycleNumber } : null;
}

export function chooseLeastShownId(ids: string[], shownIds: string[], randomIndex: RandomIndex = randomInt): string | null {
  if (ids.length === 0) return null;
  const counts = new Map(ids.map((id) => [id, 0]));
  for (const id of shownIds) if (counts.has(id)) counts.set(id, (counts.get(id) ?? 0) + 1);
  const minimum = Math.min(...counts.values());
  const candidates = ids.filter((id) => counts.get(id) === minimum);
  return candidates[randomIndex(candidates.length)] ?? null;
}
