import type { TextItem } from "./pdfExtractor";

type Rect = [number, number, number, number]; // [x1, y1, x2, y2]

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

  // Fuzzy fallback using sliding-window Levenshtein distance
  if (pos === -1) {
    const maxDist = Math.max(3, Math.floor(normalizedQuote.length * 0.15));
    let bestDist = maxDist + 1;
    let bestPos = -1;
    const windowLen = normalizedQuote.length;

    // Only attempt if quote is reasonable length (avoid O(n*m) on huge texts)
    if (windowLen <= 500 && normalizedPage.length <= 50000) {
      for (let i = 0; i <= normalizedPage.length - windowLen; i++) {
        const window = normalizedPage.substring(i, i + windowLen);
        const dist = levenshteinDistance(normalizedQuote, window);
        if (dist < bestDist) {
          bestDist = dist;
          bestPos = i;
          if (dist === 0) break; // exact match found
        }
      }
      if (bestPos >= 0 && bestDist <= maxDist) {
        pos = bestPos;
      }
    }

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
