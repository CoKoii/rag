const HAN_SEGMENT = /^\p{Script=Han}+$/u;

export function buildKeywordTerms(text: string): string {
  const segments = text.match(/[\p{Script=Han}]+|[\p{L}\p{N}_]+/gu) ?? [];
  const terms = new Set<string>();

  for (const rawSegment of segments) {
    const segment = rawSegment.toLocaleLowerCase();
    if (!HAN_SEGMENT.test(segment)) {
      terms.add(segment);
      continue;
    }

    if (segment.length <= 4) terms.add(segment);
    if (segment.length === 1) {
      terms.add(segment);
      continue;
    }
    for (let index = 0; index < segment.length - 1; index += 1) {
      terms.add(segment.slice(index, index + 2));
    }
  }

  return [...terms].join(' ');
}

export function buildTsQuery(text: string): string {
  return buildKeywordTerms(text)
    .split(' ')
    .filter(Boolean)
    .slice(0, 64)
    .join(' | ');
}
