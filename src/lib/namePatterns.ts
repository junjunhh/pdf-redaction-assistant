import type { TextMatch } from './datePatterns';

type NameToken = {
  text: string;
  start: number;
  end: number;
  isHonorific: boolean;
};

const honorifics = new Set([
  'Dr',
  'Lord',
  'Miss',
  'Mr',
  'Mrs',
  'Ms',
  'Prof',
  'Rev',
  'Sir',
]);

const blockedWords = new Set([
  'Account',
  'Abstract',
  'Algebra',
  'Algorithm',
  'API',
  'Appendix',
  'Area',
  'Assistant',
  'Assignment',
  'Backend',
  'Binary',
  'Browser',
  'Case',
  'Chapter',
  'Circuits',
  'Code',
  'Compatible',
  'Combinational',
  'Computer',
  'Conclusion',
  'Correctness',
  'Created',
  'Database',
  'Date',
  'Dates',
  'Decomposition',
  'Decimal',
  'Definition',
  'Detected',
  'Description',
  'Design',
  'Digital',
  'Document',
  'Entities',
  'Entity',
  'Example',
  'Examples',
  'Extraction',
  'Figure',
  'Framework',
  'Functionality',
  'Follow',
  'Goal',
  'Good',
  'Guidelines',
  'Hardware',
  'Hexadecimal',
  'Hints',
  'Home',
  'How',
  'Index',
  'Instructions',
  'Interface',
  'Introduction',
  'Invoice',
  'ISO',
  'Key',
  'Layout',
  'Libraries',
  'Library',
  'Logic',
  'Luck',
  'Marking',
  'Module',
  'Name',
  'Names',
  'Network',
  'Notation',
  'Number',
  'Organisation',
  'Organization',
  'Overview',
  'Page',
  'Pages',
  'Panel',
  'PDF',
  'Performance',
  'Phone',
  'Prepared',
  'Problem',
  'Programmable',
  'Protocol',
  'Quality',
  'Recommended',
  'Redaction',
  'Reference',
  'References',
  'Remember',
  'Review',
  'Rubric',
  'Rules',
  'Search',
  'Section',
  'Sequential',
  'Sites',
  'Software',
  'Structure',
  'Stretch',
  'Submission',
  'Summary',
  'System',
  'Table',
  'Technical',
  'Terms',
  'Test',
  'The',
  'Theorem',
  'Thumbnail',
  'Thumbnails',
  'Title',
  'Upload',
  'Viewer',
  'Weight',
  'Web',
  'We',
  'You',
]);

const dateWords = new Set([
  'April',
  'August',
  'December',
  'February',
  'Friday',
  'January',
  'July',
  'June',
  'March',
  'Monday',
  'November',
  'October',
  'Saturday',
  'September',
  'Sunday',
  'Thursday',
  'Tuesday',
  'Wednesday',
]);

const commonTitlePhrases = new Set([
  'Account Number',
  'Browser Only',
  'Date Created',
  'Dates Names',
  'Detected Entities',
  'Document Prepared',
  'Document Review',
  'Area Description',
  'Area Description Weight',
  'Area Description Weight Code',
  'Browser Compatible',
  'Boolean Algebra',
  'Code Quality',
  'Combinational Circuits',
  'Computer Organization',
  'Design Three',
  'Digital Logic',
  'Entity Examples',
  'Entity Extraction',
  'Follow Up',
  'Good Luck',
  'Hexadecimal Notation',
  'Home Assignment',
  'How You',
  'Interface Layout',
  'ISO Date Example',
  'Invoice Number',
  'Key Terms',
  'Marking Rubric',
  'More Entity Examples',
  'Overview You',
  'Page Number',
  'Page One',
  'Page Thumbnails',
  'Page Two',
  'PDF Viewer',
  'Phone Number',
  'Problem Decomposition',
  'Programmable Logic',
  'Redaction Assistant Test',
  'Reference Number',
  'Remember We',
  'Review Panel',
  'Sequential Circuits',
  'Structure Organisation',
  'Submission Instructions',
  'Technical Guidelines',
  'The Binary',
  'The Decimal',
  'Title Case',
  'Upload New PDF',
  'Web Sites',
]);

const nameCore = String.raw`[A-Z](?:[a-z]+|[’'][A-Z]?[a-z]+)(?:[-’'][A-Z]?[a-z]+)*`;
const tokenPattern = new RegExp(
  String.raw`\b(?:Dr|Mr|Mrs|Ms|Miss|Prof|Sir|Lord|Rev)\.?|\b${nameCore}\b`,
  'g',
);

function normalizeToken(token: string) {
  return token.replace(/[.,:;()[\]{}]/g, '').replace(/\.$/, '');
}

function isHonorific(token: string) {
  return honorifics.has(normalizeToken(token));
}

function tokenizeLikelyNameWords(text: string): NameToken[] {
  tokenPattern.lastIndex = 0;

  return Array.from(text.matchAll(tokenPattern), (match) => {
    const value = match[0];
    const start = match.index ?? 0;

    return {
      text: value,
      start,
      end: start + value.length,
      isHonorific: isHonorific(value),
    };
  });
}

function tokensAreAdjacent(text: string, first: NameToken, second: NameToken) {
  return /^[\s]+$/.test(text.slice(first.end, second.start));
}

function groupAdjacentTokens(text: string, tokens: NameToken[]) {
  const groups: NameToken[][] = [];
  let currentGroup: NameToken[] = [];

  tokens.forEach((token) => {
    const previousToken = currentGroup[currentGroup.length - 1];

    if (
      previousToken &&
      !tokensAreAdjacent(text, previousToken, token)
    ) {
      groups.push(currentGroup);
      currentGroup = [];
    }

    currentGroup.push(token);
  });

  if (currentGroup.length > 0) {
    groups.push(currentGroup);
  }

  return groups;
}

function overlapsBlockedRange(match: TextMatch, blockedRanges: TextMatch[]) {
  return blockedRanges.some(
    (range) => match.start < range.end && match.end > range.start,
  );
}

function hasBlockedWord(tokens: string[]) {
  return tokens.some((token) => {
    const normalized = normalizeToken(token);

    return (
      blockedWords.has(normalized) ||
      dateWords.has(normalized) ||
      normalized.length === 1 ||
      normalized.toUpperCase() === normalized
    );
  });
}

function looksLikePersonName(candidate: TextMatch) {
  if (commonTitlePhrases.has(candidate.text)) {
    return false;
  }

  const tokens = candidate.text.split(/\s+/).filter(Boolean);
  const startsWithHonorific = tokens.length > 0 && isHonorific(tokens[0]);
  const nameTokens = startsWithHonorific ? tokens.slice(1) : tokens;

  if (normalizeToken(tokens[0] ?? '') === 'The') {
    return false;
  }

  if (nameTokens.length < 2 || nameTokens.length > 3) {
    return false;
  }

  if (hasBlockedWord(tokens)) {
    return false;
  }

  if (/[^A-Za-z\s'’-]/.test(candidate.text)) {
    return false;
  }

  return nameTokens.every((token) => !isHonorific(token));
}

function createCandidate(tokens: NameToken[]): TextMatch {
  return {
    text: tokens.map((token) => token.text).join(' '),
    start: tokens[0].start,
    end: tokens[tokens.length - 1]?.end ?? tokens[0].end,
  };
}

function createCandidatesFromGroup(group: NameToken[]): TextMatch[] {
  const candidates: TextMatch[] = [];

  for (let startIndex = 0; startIndex < group.length; startIndex += 1) {
    const firstToken = group[startIndex];
    const startsWithHonorific = firstToken.isHonorific;
    const minEndIndex = startIndex + (startsWithHonorific ? 3 : 2);
    const maxEndIndex = Math.min(
      group.length,
      startIndex + (startsWithHonorific ? 4 : 3),
    );

    for (let endIndex = minEndIndex; endIndex <= maxEndIndex; endIndex += 1) {
      const candidateTokens = group.slice(startIndex, endIndex);
      const nameTokens = startsWithHonorific
        ? candidateTokens.slice(1)
        : candidateTokens;

      if (nameTokens.some((token) => token.isHonorific)) {
        continue;
      }

      candidates.push(createCandidate(candidateTokens));
    }
  }

  return candidates;
}

function removeDuplicateAndOverlappingMatches(matches: TextMatch[]) {
  const seen = new Set<string>();

  return matches
    .sort((first, second) => {
      if (first.start !== second.start) {
        return first.start - second.start;
      }

      return first.end - second.end;
    })
    .filter((match, index, sortedMatches) => {
      const key = `${match.start}-${match.end}-${match.text}`;

      if (seen.has(key)) {
        return false;
      }

      seen.add(key);

      const earlierOverlap = sortedMatches
        .slice(0, index)
        .some(
          (keptMatch) =>
            match.start < keptMatch.end && match.end > keptMatch.start,
        );

      return !earlierOverlap;
    });
}

export function findNameMatches(
  text: string,
  blockedRanges: TextMatch[] = [],
): TextMatch[] {
  // Heuristic name detection intentionally rejects common document heading,
  // rubric, and UI terms because PDFs often expose headings as Title Case text.
  const tokens = tokenizeLikelyNameWords(text);
  const candidates = groupAdjacentTokens(text, tokens)
    .flatMap(createCandidatesFromGroup)
    .filter(
      (candidate) =>
        looksLikePersonName(candidate) &&
        !overlapsBlockedRange(candidate, blockedRanges),
    );

  return removeDuplicateAndOverlappingMatches(candidates);
}
