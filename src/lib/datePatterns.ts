export type TextMatch = {
  text: string;
  start: number;
  end: number;
};

const monthNames =
  'January|February|March|April|May|June|July|August|September|October|November|December';
const monthAbbreviations = 'Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec';
const hyphenSeparator = String.raw`[-\u2010\u2011\u2012\u2013\u2014\u2212]`;

function createDatePattern(dateBody: string) {
  return new RegExp(`(^|[^A-Za-z0-9])(${dateBody})(?=$|[^A-Za-z0-9])`, 'gi');
}

export const datePatterns: RegExp[] = [
  createDatePattern(String.raw`\d{1,2}\s*/\s*\d{1,2}\s*/\s*\d{4}`),
  createDatePattern(
    String.raw`\d{1,2}\s*${hyphenSeparator}\s*\d{1,2}\s*${hyphenSeparator}\s*\d{4}`,
  ),
  createDatePattern(
    String.raw`\d{1,2}\s*${hyphenSeparator}\s*(?:${monthAbbreviations})\s*${hyphenSeparator}\s*\d{4}`,
  ),
  createDatePattern(
    String.raw`(?:${monthNames}|${monthAbbreviations})\s+\d{1,2},?\s*\d{4}`,
  ),
  createDatePattern(String.raw`\d{1,2}\s+(?:${monthNames})\s+\d{4}`),
  createDatePattern(
    String.raw`\d{1,2}\s+(?:${monthAbbreviations})\s+\d{4}`,
  ),
  createDatePattern(
    String.raw`\d{4}\s*${hyphenSeparator}\s*\d{2}\s*${hyphenSeparator}\s*\d{2}`,
  ),
];

function createTextMatch(match: RegExpMatchArray): TextMatch {
  const prefix = match[1] ?? '';
  const value = match[2] ?? match[0];
  const start = (match.index ?? 0) + prefix.length;

  return {
    text: value,
    start,
    end: start + value.length,
  };
}

function dedupeDateMatches(matches: TextMatch[]) {
  const seen = new Set<string>();

  return matches.filter((match) => {
    const key = `${match.start}-${match.end}-${match.text}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

export function findDateMatches(text: string): TextMatch[] {
  const matches = datePatterns.flatMap((pattern) => {
    pattern.lastIndex = 0;

    return Array.from(text.matchAll(pattern), createTextMatch);
  });

  return dedupeDateMatches(matches).sort(
    (first, second) => first.start - second.start,
  );
}
