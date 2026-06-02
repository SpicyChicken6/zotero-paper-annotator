import type { TextItem } from "./pdfExtractor";

type Rect = [number, number, number, number]; // [x1, y1, x2, y2]

const MIN_FUZZY_QUOTE_LENGTH = 20;
const MAX_FUZZY_QUOTE_LENGTH = 120;
const MAX_FUZZY_PAGE_LENGTH = 5000;
const MAX_FUZZY_CANDIDATES = 24;
const MAX_ANCHOR_OCCURRENCES = 6;
const FUZZY_START_OFFSETS = [-2, -1, 0, 1, 2];
const COMMON_ANCHOR_WORDS = new Set([
  "about",
  "after",
  "also",
  "among",
  "because",
  "before",
  "being",
  "between",
  "could",
  "during",
  "first",
  "found",
  "have",
  "other",
  "should",
  "their",
  "there",
  "these",
  "those",
  "through",
  "under",
  "using",
  "which",
  "while",
  "would",
]);

interface FuzzyAnchor {
  text: string;
  quoteIndex: number;
}

/**
 * Normalize whitespace in a string for comparison.
 */
function normalize(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/[\u2018\u2019\u201A\u2039\u203A]/g, "'") // smart single quotes → straight
    .replace(/[\u201C\u201D\u201E\u00AB\u00BB]/g, '"') // smart double quotes → straight
    .replace(/[\u2013\u2014]/g, "-") // en-dash, em-dash → hyphen
    .replace(/[\u2026]/g, "...") // ellipsis → three dots
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Compute the Levenshtein (edit) distance between two strings.
 * Uses a two-row optimization for memory efficiency.
 */
function levenshteinDistance(a: string, b: string): number {
  const m = a.length,
    n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let curr = new Array(n + 1);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      curr[j] =
        a[i - 1] === b[j - 1]
          ? prev[j - 1]
          : 1 + Math.min(prev[j - 1], prev[j], curr[j - 1]);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

function chooseFuzzyAnchors(normalizedQuote: string): FuzzyAnchor[] {
  const anchors: FuzzyAnchor[] = [];
  const wordPattern = /[a-z0-9][a-z0-9'-]{4,}/g;
  let match: RegExpExecArray | null;

  while ((match = wordPattern.exec(normalizedQuote)) !== null) {
    const text = match[0];
    if (!COMMON_ANCHOR_WORDS.has(text)) {
      anchors.push({ text, quoteIndex: match.index });
    }
  }

  if (anchors.length <= 3) {
    return anchors;
  }

  const selected = new Map<string, FuzzyAnchor>();
  const addAnchor = (anchor: FuzzyAnchor) => {
    if (!selected.has(anchor.text)) {
      selected.set(anchor.text, anchor);
    }
  };

  addAnchor(anchors[0]);
  addAnchor(anchors[Math.floor(anchors.length / 2)]);
  addAnchor(anchors[anchors.length - 1]);

  const longestAnchors = [...anchors].sort(
    (a, b) => b.text.length - a.text.length,
  );
  for (const anchor of longestAnchors) {
    addAnchor(anchor);
    if (selected.size >= 6) break;
  }

  return [...selected.values()];
}

function addCandidateStart(
  candidates: Set<number>,
  start: number,
  maxStart: number,
): void {
  for (const offset of FUZZY_START_OFFSETS) {
    const candidateStart = Math.max(0, Math.min(maxStart, start + offset));
    candidates.add(candidateStart);
    if (candidates.size >= MAX_FUZZY_CANDIDATES) {
      return;
    }
  }
}

function findFuzzyMatch(
  normalizedQuote: string,
  normalizedPage: string,
): number {
  const quoteLen = normalizedQuote.length;

  if (
    quoteLen < MIN_FUZZY_QUOTE_LENGTH ||
    quoteLen > MAX_FUZZY_QUOTE_LENGTH ||
    normalizedPage.length > MAX_FUZZY_PAGE_LENGTH ||
    normalizedPage.length < quoteLen
  ) {
    return -1;
  }

  const anchors = chooseFuzzyAnchors(normalizedQuote);
  if (anchors.length === 0) {
    return -1;
  }

  const maxStart = normalizedPage.length - quoteLen;
  const candidates = new Set<number>();

  for (const anchor of anchors) {
    let searchFrom = 0;
    let occurrences = 0;

    while (occurrences < MAX_ANCHOR_OCCURRENCES) {
      const anchorPos = normalizedPage.indexOf(anchor.text, searchFrom);
      if (anchorPos === -1) break;

      addCandidateStart(candidates, anchorPos - anchor.quoteIndex, maxStart);
      if (candidates.size >= MAX_FUZZY_CANDIDATES) break;

      searchFrom = anchorPos + anchor.text.length;
      occurrences += 1;
    }

    if (candidates.size >= MAX_FUZZY_CANDIDATES) break;
  }

  if (candidates.size === 0) {
    return -1;
  }

  const maxDist = Math.max(2, Math.floor(quoteLen * 0.12));
  let bestDist = maxDist + 1;
  let bestPos = -1;

  for (const candidateStart of candidates) {
    const window = normalizedPage.substring(
      candidateStart,
      candidateStart + quoteLen,
    );
    const dist = levenshteinDistance(normalizedQuote, window);
    if (dist < bestDist) {
      bestDist = dist;
      bestPos = candidateStart;
    }
  }

  return bestPos >= 0 && bestDist <= maxDist ? bestPos : -1;
}

/**
 * Find a quote in a page's text and return the bounding rects of the matched text items.
 *
 * Uses normalized substring matching. If the exact normalized quote is found
 * in the normalized page text, maps the match back to the original text items
 * to compute bounding rectangles.
 *
 * Returns null if the quote cannot be matched.
 */
function findQuoteInPage(
  quote: string,
  pageText: string,
  items: TextItem[],
): Rect[] | null {
  const normalizedQuote = normalize(quote);
  const normalizedPage = normalize(pageText);

  let pos = normalizedPage.indexOf(normalizedQuote);

  if (pos === -1) {
    pos = findFuzzyMatch(normalizedQuote, normalizedPage);
    if (pos === -1) {
      return null;
    }
  }

  // Build a character-to-item mapping for the normalized page text.
  const itemSpans: Array<{
    item: TextItem;
    startChar: number;
    endChar: number;
  }> = [];
  let charPos = 0;

  for (let i = 0; i < items.length; i++) {
    const normStr = normalize(items[i].str);
    if (normStr.length === 0) continue;

    if (charPos > 0) {
      charPos += 1; // account for the space between items
    }

    itemSpans.push({
      item: items[i],
      startChar: charPos,
      endChar: charPos + normStr.length,
    });

    charPos += normStr.length;
  }

  // Find items that overlap with the match range
  const matchEnd = pos + normalizedQuote.length;
  const matchedItems = itemSpans.filter(
    (span) => span.startChar < matchEnd && span.endChar > pos,
  );

  if (matchedItems.length === 0) {
    return null;
  }

  // Convert matched items to bounding rects
  const rects: Rect[] = matchedItems.map((span) => {
    const item = span.item;
    return [item.x, item.y, item.x + item.width, item.y + item.height];
  });

  return mergeRects(rects);
}

/**
 * Merge rects that are on the same line into single rects.
 */
function mergeRects(rects: Rect[]): Rect[] {
  if (rects.length === 0) return [];

  const Y_TOLERANCE = 2;
  const sorted = [...rects].sort((a, b) => {
    const yDiff = a[1] - b[1];
    if (Math.abs(yDiff) > Y_TOLERANCE) return yDiff;
    return a[0] - b[0];
  });

  const merged: Rect[] = [];
  let current = [...sorted[0]] as Rect;

  for (let i = 1; i < sorted.length; i++) {
    const next = sorted[i];
    const sameLine = Math.abs(current[1] - next[1]) <= Y_TOLERANCE;
    if (sameLine) {
      current[0] = Math.min(current[0], next[0]);
      current[1] = Math.min(current[1], next[1]);
      current[2] = Math.max(current[2], next[2]);
      current[3] = Math.max(current[3], next[3]);
    } else {
      merged.push(current);
      current = [...next] as Rect;
    }
  }
  merged.push(current);

  return merged;
}

export { findQuoteInPage, mergeRects, normalize };
export type { Rect };
