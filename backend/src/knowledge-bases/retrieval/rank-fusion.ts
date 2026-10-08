export interface FusedRank {
  chunkId: string;
  score: number;
}

const RRF_CONSTANT = 60;

export function reciprocalRankFusion(
  vectorChunkIds: string[],
  keywordChunkIds: string[],
): FusedRank[] {
  const scores = new Map<string, number>();
  for (const rankedIds of [vectorChunkIds, keywordChunkIds]) {
    rankedIds.forEach((chunkId, index) => {
      scores.set(
        chunkId,
        (scores.get(chunkId) ?? 0) + 1 / (RRF_CONSTANT + index + 1),
      );
    });
  }

  return [...scores]
    .map(([chunkId, score]) => ({ chunkId, score }))
    .sort((left, right) => right.score - left.score);
}
