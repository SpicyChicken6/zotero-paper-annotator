# Zotero Paper Annotator (ZPA) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Zotero 7/8 plugin that automatically annotates academic papers with color-coded highlights, per-passage notes, and an overall summary using the DeepSeek API when a PDF is opened.

**Architecture:** Single-pass LLM approach. On PDF open, extract text with positions via PDF.js, send to DeepSeek API, parse structured JSON response, fuzzy-match quotes back to PDF coordinates, and create Zotero highlight annotations + notes. Skip already-annotated papers via item tag.

**Tech Stack:** TypeScript, zotero-plugin-template, zotero-plugin-toolkit, esbuild, DeepSeek API (OpenAI-compatible), fuse.js (fuzzy matching)

---

## File Structure

```
zotero-paper-annotator/
├── src/
│   ├── index.ts              # Entry point, global type declarations
│   ├── hooks.ts              # Lifecycle hooks + tab notifier for PDF open
│   ├── addon.ts              # Addon class (state container)
│   ├── modules/
│   │   ├── preferences.ts    # Read/write plugin preferences with defaults
│   │   ├── skipCheck.ts      # Check if item has zpa-annotated tag
│   │   ├── llmClient.ts      # DeepSeek API: send text, get structured annotations
│   │   ├── pdfExtractor.ts   # Extract text + rects from PDF.js reader
│   │   ├── textMatcher.ts    # Fuzzy-match LLM quotes to PDF positions
│   │   ├── annotator.ts      # Create Zotero highlights, notes, tags
│   │   └── pipeline.ts       # Orchestrate the full annotation flow
│   └── utils/
│       └── tokenEstimator.ts # Estimate token count from text length
├── test/
│   ├── llmClient.test.ts     # Unit test: response parsing & validation
│   └── textMatcher.test.ts   # Unit test: fuzzy matching logic
├── addon/
│   ├── bootstrap.js          # Zotero bootstrap entry (from template)
│   ├── manifest.json         # Plugin metadata (customized)
│   ├── prefs.xhtml           # Preferences UI panel
│   └── chrome/
│       └── locale/
│           └── en-US/
│               └── addon.ftl # Localization strings
├── package.json              # Dependencies + scripts (customized)
├── tsconfig.json             # TypeScript config (from template)
└── .env                      # Local Zotero path for dev
```

---

### Task 1: Project Scaffold

**Files:**

- Clone: zotero-plugin-template into project root
- Modify: `package.json` (name, description, dependencies)
- Modify: `addon/manifest.json` (plugin ID, name, version)
- Modify: `src/index.ts` (plugin ID constant)

- [ ] **Step 1: Clone the zotero-plugin-template**

```bash
cd /home/zhijiany/workdir/repos/zotero-paper-annotator
# Save the existing design spec
cp 2026-04-08-zotero-paper-annotator-design.md /tmp/zpa-design-spec.md
# Clone template (shallow, no git history)
git clone --depth 1 https://github.com/windingwind/zotero-plugin-template.git /tmp/zotero-plugin-template
# Copy template contents (excluding .git)
rsync -av --exclude='.git' /tmp/zotero-plugin-template/ .
# Restore design spec
mkdir -p docs/superpowers/specs docs/superpowers/plans
cp /tmp/zpa-design-spec.md docs/superpowers/specs/2026-04-08-zotero-paper-annotator-design.md
```

- [ ] **Step 2: Update package.json**

Change the name, description, and add the fuse.js dependency:

```json
{
  "name": "zotero-paper-annotator",
  "version": "0.1.0",
  "description": "Automatically annotate academic papers with LLM-powered highlights and summaries",
  "config": {
    "addonName": "Zotero Paper Annotator",
    "addonID": "zotero-paper-annotator@zhijianyu",
    "addonRef": "zpa",
    "addonInstance": "ZPA"
  }
}
```

Add runtime dependency:

```bash
npm install fuse.js
```

- [ ] **Step 3: Update addon/manifest.json**

Set the plugin metadata:

```json
{
  "manifest_version": 2,
  "name": "Zotero Paper Annotator",
  "version": "0.1.0",
  "description": "Automatically annotate papers with LLM-powered highlights and summaries",
  "author": "Zhijian Yu",
  "applications": {
    "zotero": {
      "id": "zotero-paper-annotator@zhijianyu",
      "update_url": "https://raw.githubusercontent.com/zhijianyu/zotero-paper-annotator/main/update.json",
      "strict_min_version": "7.0",
      "strict_max_version": "8.*"
    }
  }
}
```

- [ ] **Step 4: Install dependencies and verify build**

```bash
npm install
npm run build
```

Expected: Build completes with no errors, produces `.xpi` file in `.scaffold/build/`.

- [ ] **Step 5: Commit scaffold**

```bash
git add -A
git commit -m "feat: scaffold project from zotero-plugin-template"
```

---

### Task 2: Preferences Module

**Files:**

- Create: `src/modules/preferences.ts`
- Modify: `addon/prefs.xhtml` (preferences UI — basic version now, polished in Task 9)

- [ ] **Step 1: Create src/modules/preferences.ts**

```typescript
// src/modules/preferences.ts

const PREF_PREFIX = "extensions.zpa";

interface ZPAPreferences {
  apiKey: string;
  apiBaseUrl: string;
  modelName: string;
  maxTokenThreshold: number;
  autoAnnotate: boolean;
  colorKeyFinding: string;
  colorMethodology: string;
  colorConclusion: string;
  colorLimitation: string;
}

const DEFAULTS: ZPAPreferences = {
  apiKey: "",
  apiBaseUrl: "https://api.deepseek.com",
  modelName: "deepseek-chat",
  maxTokenThreshold: 120000,
  autoAnnotate: true,
  colorKeyFinding: "#ffd400",
  colorMethodology: "#2ea8e5",
  colorConclusion: "#5fb236",
  colorLimitation: "#f19837",
};

function getPref<K extends keyof ZPAPreferences>(key: K): ZPAPreferences[K] {
  const fullKey = `${PREF_PREFIX}.${key}`;
  const value = Zotero.Prefs.get(fullKey, true);
  if (value === undefined || value === null) {
    return DEFAULTS[key];
  }
  return value as ZPAPreferences[K];
}

function setPref<K extends keyof ZPAPreferences>(
  key: K,
  value: ZPAPreferences[K],
): void {
  const fullKey = `${PREF_PREFIX}.${key}`;
  Zotero.Prefs.set(fullKey, value, true);
}

function isConfigured(): boolean {
  return getPref("apiKey").length > 0;
}

function getColorForCategory(category: string): string {
  switch (category) {
    case "key_finding":
      return getPref("colorKeyFinding");
    case "methodology":
      return getPref("colorMethodology");
    case "conclusion":
      return getPref("colorConclusion");
    case "limitation":
      return getPref("colorLimitation");
    default:
      return getPref("colorKeyFinding");
  }
}

export { getPref, setPref, isConfigured, getColorForCategory, DEFAULTS };
export type { ZPAPreferences };
```

- [ ] **Step 2: Verify the module compiles**

```bash
npm run build
```

Expected: Build succeeds with no type errors.

- [ ] **Step 3: Commit**

```bash
git add src/modules/preferences.ts
git commit -m "feat: add preferences module with defaults"
```

---

### Task 3: Token Estimator & Skip Check

**Files:**

- Create: `src/utils/tokenEstimator.ts`
- Create: `src/modules/skipCheck.ts`

- [ ] **Step 1: Create src/utils/tokenEstimator.ts**

Simple heuristic: ~4 characters per token for English text.

```typescript
// src/utils/tokenEstimator.ts

/**
 * Estimate token count from text length.
 * Uses ~4 chars/token heuristic for English text.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Check if text exceeds the given token threshold.
 */
export function exceedsTokenLimit(text: string, maxTokens: number): boolean {
  return estimateTokens(text) > maxTokens;
}
```

- [ ] **Step 2: Create src/modules/skipCheck.ts**

```typescript
// src/modules/skipCheck.ts

const ZPA_TAG = "zpa-annotated";

/**
 * Check if a Zotero item has already been annotated by ZPA.
 */
export function isAlreadyAnnotated(item: Zotero.Item): boolean {
  const tags = item.getTags();
  return tags.some((t: { tag: string }) => t.tag === ZPA_TAG);
}

/**
 * Mark a Zotero item as annotated by ZPA.
 */
export async function markAsAnnotated(item: Zotero.Item): Promise<void> {
  item.addTag(ZPA_TAG, 0);
  await item.saveTx();
}

export { ZPA_TAG };
```

- [ ] **Step 3: Verify build**

```bash
npm run build
```

Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/utils/tokenEstimator.ts src/modules/skipCheck.ts
git commit -m "feat: add token estimator and skip check module"
```

---

### Task 4: LLM Client Module

**Files:**

- Create: `src/modules/llmClient.ts`
- Create: `test/llmClient.test.ts`

- [ ] **Step 1: Define the response types and write the failing test**

```typescript
// test/llmClient.test.ts
import { expect } from "chai";
import {
  parseAnnotationResponse,
  type LLMAnnotation,
  type LLMResponse,
} from "../src/modules/llmClient";

describe("parseAnnotationResponse", () => {
  it("parses a valid response with summary and annotations", () => {
    const raw = JSON.stringify({
      summary: "This paper studies X.",
      annotations: [
        {
          page: 3,
          quote: "We found that X leads to Y",
          category: "key_finding",
          note: "Main finding of the study",
        },
        {
          page: 5,
          quote: "Using method Z, we analyzed",
          category: "methodology",
          note: "Primary analytical method",
        },
      ],
    });

    const result = parseAnnotationResponse(raw);
    expect(result.summary).to.equal("This paper studies X.");
    expect(result.annotations).to.have.length(2);
    expect(result.annotations[0].page).to.equal(3);
    expect(result.annotations[0].quote).to.equal("We found that X leads to Y");
    expect(result.annotations[0].category).to.equal("key_finding");
    expect(result.annotations[0].note).to.equal("Main finding of the study");
  });

  it("throws on invalid JSON", () => {
    expect(() => parseAnnotationResponse("not json")).to.throw();
  });

  it("throws when summary is missing", () => {
    const raw = JSON.stringify({ annotations: [] });
    expect(() => parseAnnotationResponse(raw)).to.throw("missing summary");
  });

  it("throws when annotations is not an array", () => {
    const raw = JSON.stringify({
      summary: "Test",
      annotations: "not an array",
    });
    expect(() => parseAnnotationResponse(raw)).to.throw(
      "annotations must be an array",
    );
  });

  it("filters out annotations with invalid category", () => {
    const raw = JSON.stringify({
      summary: "Test",
      annotations: [
        {
          page: 1,
          quote: "Valid quote",
          category: "key_finding",
          note: "Valid note",
        },
        {
          page: 2,
          quote: "Bad category",
          category: "unknown_type",
          note: "Should be filtered",
        },
      ],
    });

    const result = parseAnnotationResponse(raw);
    expect(result.annotations).to.have.length(1);
    expect(result.annotations[0].category).to.equal("key_finding");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm test -- --grep "parseAnnotationResponse"
```

Expected: FAIL — `parseAnnotationResponse` is not defined.

- [ ] **Step 3: Create src/modules/llmClient.ts**

```typescript
// src/modules/llmClient.ts

import { getPref } from "./preferences";

const VALID_CATEGORIES = [
  "key_finding",
  "methodology",
  "conclusion",
  "limitation",
] as const;

type AnnotationCategory = (typeof VALID_CATEGORIES)[number];

interface LLMAnnotation {
  page: number;
  quote: string;
  category: AnnotationCategory;
  note: string;
}

interface LLMResponse {
  summary: string;
  annotations: LLMAnnotation[];
}

const SYSTEM_PROMPT = `You are an expert academic paper annotator. Given the full text of an academic paper, identify the most important passages and provide a structured analysis.

Return a JSON object with exactly this structure:
{
  "summary": "A 2-3 sentence overall summary of the paper's main contribution and findings.",
  "annotations": [
    {
      "page": <page number as integer>,
      "quote": "<exact text from the paper to highlight — must be a verbatim substring>",
      "category": "<one of: key_finding, methodology, conclusion, limitation>",
      "note": "<1-2 sentence explanation of why this passage is important>"
    }
  ]
}

Rules:
- The "quote" field MUST be an exact, verbatim substring from the paper text. Do not paraphrase.
- Keep quotes to 1-3 sentences. Do not quote entire paragraphs.
- Include 10-20 annotations covering the most important passages.
- Categories: key_finding (important results), methodology (methods/design), conclusion (implications), limitation (caveats/limitations).
- Return ONLY valid JSON. No markdown, no explanation outside the JSON.`;

function parseAnnotationResponse(raw: string): LLMResponse {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Invalid JSON in LLM response: ${raw.slice(0, 100)}`);
  }

  const obj = parsed as Record<string, unknown>;

  if (typeof obj.summary !== "string" || obj.summary.length === 0) {
    throw new Error("LLM response missing summary");
  }

  if (!Array.isArray(obj.annotations)) {
    throw new Error("LLM response annotations must be an array");
  }

  const validAnnotations: LLMAnnotation[] = obj.annotations
    .filter((a: Record<string, unknown>) => {
      return (
        typeof a.page === "number" &&
        typeof a.quote === "string" &&
        typeof a.category === "string" &&
        typeof a.note === "string" &&
        (VALID_CATEGORIES as readonly string[]).includes(a.category)
      );
    })
    .map((a: Record<string, unknown>) => ({
      page: a.page as number,
      quote: a.quote as string,
      category: a.category as AnnotationCategory,
      note: a.note as string,
    }));

  return {
    summary: obj.summary,
    annotations: validAnnotations,
  };
}

async function callLLM(paperText: string): Promise<LLMResponse> {
  const apiKey = getPref("apiKey");
  const baseUrl = getPref("apiBaseUrl");
  const model = getPref("modelName");

  const url = `${baseUrl}/v1/chat/completions`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: paperText },
      ],
      response_format: { type: "json_object" },
      temperature: 0.1,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `LLM API error (${response.status}): ${errorText.slice(0, 200)}`,
    );
  }

  const data = (await response.json()) as {
    choices: Array<{ message: { content: string } }>;
  };

  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("LLM API returned empty response");
  }

  return parseAnnotationResponse(content);
}

export { callLLM, parseAnnotationResponse, SYSTEM_PROMPT, VALID_CATEGORIES };
export type { LLMAnnotation, LLMResponse, AnnotationCategory };
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npm test -- --grep "parseAnnotationResponse"
```

Expected: All 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/llmClient.ts test/llmClient.test.ts
git commit -m "feat: add LLM client with response parsing and tests"
```

---

### Task 5: PDF Text Extraction Module

**Files:**

- Create: `src/modules/pdfExtractor.ts`

- [ ] **Step 1: Create src/modules/pdfExtractor.ts**

This module extracts text from the PDF reader. It accesses the PDF.js document through Zotero's reader instance and extracts text items with their bounding rectangles per page.

```typescript
// src/modules/pdfExtractor.ts

interface TextItem {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface PageText {
  pageIndex: number;
  pageLabel: string;
  text: string;
  items: TextItem[];
}

interface ExtractionResult {
  fullText: string;
  pages: PageText[];
}

/**
 * Get the PDF.js document from a Zotero reader instance.
 * Accesses internal reader structure — may need adjustment across Zotero versions.
 */
function getPDFDocument(reader: _ZoteroTypes.ReaderInstance): unknown | null {
  try {
    const iframeWindow = (reader as any)._iframeWindow;
    if (!iframeWindow) return null;
    const wrappedWindow = iframeWindow.wrappedJSObject || iframeWindow;
    const pdfView = wrappedWindow?.PDFViewerApplication?.pdfDocument;
    return pdfView || null;
  } catch {
    return null;
  }
}

/**
 * Extract text content with positions from all pages of a PDF.
 */
async function extractText(
  reader: _ZoteroTypes.ReaderInstance,
): Promise<ExtractionResult> {
  const pdfDocument = getPDFDocument(reader);
  if (!pdfDocument) {
    throw new Error("Could not access PDF document from reader");
  }

  const doc = pdfDocument as any;
  const numPages: number = doc.numPages;
  const pages: PageText[] = [];
  const fullTextParts: string[] = [];

  for (let i = 1; i <= numPages; i++) {
    const page = await doc.getPage(i);
    const textContent = await page.getTextContent();

    const items: TextItem[] = textContent.items
      .filter(
        (item: any) => typeof item.str === "string" && item.str.length > 0,
      )
      .map((item: any) => {
        const tx = item.transform;
        return {
          str: item.str,
          x: tx[4],
          y: tx[5],
          width: item.width,
          height: item.height,
        };
      });

    const pageText = items.map((item) => item.str).join(" ");

    pages.push({
      pageIndex: i - 1,
      pageLabel: String(i),
      text: pageText,
      items,
    });

    fullTextParts.push(`[Page ${i}]\n${pageText}`);
  }

  return {
    fullText: fullTextParts.join("\n\n"),
    pages,
  };
}

export { extractText, getPDFDocument };
export type { TextItem, PageText, ExtractionResult };
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

Expected: Build succeeds. (Unit testing this module requires a Zotero environment — tested manually in Task 10.)

- [ ] **Step 3: Commit**

```bash
git add src/modules/pdfExtractor.ts
git commit -m "feat: add PDF text extraction module"
```

---

### Task 6: Text Matcher Module

**Files:**

- Create: `src/modules/textMatcher.ts`
- Create: `test/textMatcher.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// test/textMatcher.test.ts
import { expect } from "chai";
import { findQuoteInPage } from "../src/modules/textMatcher";
import type { TextItem } from "../src/modules/pdfExtractor";

function makeItems(texts: string[], startX = 10, y = 100): TextItem[] {
  let x = startX;
  return texts.map((str) => {
    const item: TextItem = { str, x, y, width: str.length * 6, height: 12 };
    x += item.width + 3;
    return item;
  });
}

describe("findQuoteInPage", () => {
  it("finds an exact match and returns rects", () => {
    const items = makeItems(["We", "found", "that", "X", "leads", "to", "Y"]);
    const pageText = items.map((i) => i.str).join(" ");

    const result = findQuoteInPage("found that X leads to Y", pageText, items);
    expect(result).to.not.be.null;
    expect(result!.length).to.be.greaterThan(0);
  });

  it("handles minor whitespace differences", () => {
    const items = makeItems(["The", "result", "was", "significant"]);
    const pageText = items.map((i) => i.str).join(" ");

    const result = findQuoteInPage(
      "The result  was significant",
      pageText,
      items,
    );
    expect(result).to.not.be.null;
  });

  it("returns null when quote is not found", () => {
    const items = makeItems(["Hello", "world"]);
    const pageText = items.map((i) => i.str).join(" ");

    const result = findQuoteInPage(
      "completely different text that does not exist",
      pageText,
      items,
    );
    expect(result).to.be.null;
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- --grep "findQuoteInPage"
```

Expected: FAIL — `findQuoteInPage` not defined.

- [ ] **Step 3: Create src/modules/textMatcher.ts**

```typescript
// src/modules/textMatcher.ts

import type { TextItem } from "./pdfExtractor";

type Rect = [number, number, number, number]; // [x1, y1, x2, y2]

/**
 * Normalize whitespace in a string for comparison.
 */
function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
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

  const matchIndex = normalizedPage.indexOf(normalizedQuote);
  if (matchIndex === -1) {
    return null;
  }

  // Build a character-to-item mapping for the normalized page text.
  // We reconstruct the normalized text from items to track positions.
  const itemSpans: Array<{
    item: TextItem;
    startChar: number;
    endChar: number;
  }> = [];
  let charPos = 0;

  for (let i = 0; i < items.length; i++) {
    const normStr = items[i].str.replace(/\s+/g, " ").trim().toLowerCase();
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
  const matchEnd = matchIndex + normalizedQuote.length;
  const matchedItems = itemSpans.filter(
    (span) => span.startChar < matchEnd && span.endChar > matchIndex,
  );

  if (matchedItems.length === 0) {
    return null;
  }

  // Convert matched items to bounding rects
  const rects: Rect[] = matchedItems.map((span) => {
    const item = span.item;
    return [item.x, item.y, item.x + item.width, item.y + item.height];
  });

  // Merge rects on the same line (same y coordinate, within tolerance)
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- --grep "findQuoteInPage"
```

Expected: All 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/textMatcher.ts test/textMatcher.test.ts
git commit -m "feat: add text matcher with fuzzy quote-to-rect mapping and tests"
```

---

### Task 7: Annotator Module

**Files:**

- Create: `src/modules/annotator.ts`

- [ ] **Step 1: Create src/modules/annotator.ts**

This module creates Zotero highlight annotations, note comments, and the item-level summary.

```typescript
// src/modules/annotator.ts

import type { LLMAnnotation, LLMResponse } from "./llmClient";
import type { ExtractionResult } from "./pdfExtractor";
import type { Rect } from "./textMatcher";
import { findQuoteInPage } from "./textMatcher";
import { getColorForCategory } from "./preferences";
import { markAsAnnotated } from "./skipCheck";

interface AnnotationResult {
  created: number;
  skipped: number;
  summaryNoteCreated: boolean;
}

/**
 * Create Zotero highlight annotations from LLM output.
 */
async function createAnnotations(
  item: Zotero.Item,
  attachmentID: number,
  extraction: ExtractionResult,
  llmResponse: LLMResponse,
): Promise<AnnotationResult> {
  let created = 0;
  let skipped = 0;

  for (const ann of llmResponse.annotations) {
    // Pages in LLM response are 1-indexed, pageIndex is 0-indexed
    const pageIndex = ann.page - 1;
    const page = extraction.pages.find((p) => p.pageIndex === pageIndex);

    if (!page) {
      skipped++;
      Zotero.debug(`[ZPA] Page ${ann.page} not found, skipping annotation`);
      continue;
    }

    const rects = findQuoteInPage(ann.quote, page.text, page.items);
    if (!rects || rects.length === 0) {
      skipped++;
      Zotero.debug(
        `[ZPA] Quote not found on page ${ann.page}: "${ann.quote.slice(0, 50)}..."`,
      );
      continue;
    }

    try {
      const annotation = new Zotero.Item("annotation");
      annotation.parentID = attachmentID;
      annotation.annotationType = "highlight";
      annotation.annotationText = ann.quote;
      annotation.annotationComment = `[${ann.category}] ${ann.note}`;
      annotation.annotationColor = getColorForCategory(ann.category);
      annotation.annotationPosition = JSON.stringify({
        pageIndex,
        rects: rects.map((r: Rect) => r),
      });
      await annotation.saveTx();
      created++;
    } catch (err) {
      skipped++;
      Zotero.debug(`[ZPA] Error creating annotation: ${err}`);
    }
  }

  // Create item-level summary note
  let summaryNoteCreated = false;
  try {
    const summaryNote = new Zotero.Item("note");
    summaryNote.parentID = item.id;
    summaryNote.setNote(
      `<h2>ZPA Summary</h2><p>${llmResponse.summary}</p>` +
        `<p><em>Auto-generated by Zotero Paper Annotator</em></p>`,
    );
    await summaryNote.saveTx();
    summaryNoteCreated = true;
  } catch (err) {
    Zotero.debug(`[ZPA] Error creating summary note: ${err}`);
  }

  // Mark item as annotated
  await markAsAnnotated(item);

  return { created, skipped, summaryNoteCreated };
}

export { createAnnotations };
export type { AnnotationResult };
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/modules/annotator.ts
git commit -m "feat: add annotator module for creating Zotero highlights and notes"
```

---

### Task 8: Pipeline Orchestration

**Files:**

- Create: `src/modules/pipeline.ts`
- Modify: `src/hooks.ts`

- [ ] **Step 1: Create src/modules/pipeline.ts**

```typescript
// src/modules/pipeline.ts

import { isAlreadyAnnotated } from "./skipCheck";
import { isConfigured, getPref } from "./preferences";
import { extractText } from "./pdfExtractor";
import { callLLM } from "./llmClient";
import { createAnnotations } from "./annotator";
import { exceedsTokenLimit } from "../utils/tokenEstimator";
import type { AnnotationResult } from "./annotator";

/**
 * Run the full annotation pipeline for a reader instance.
 * Returns null if the paper was skipped, or an AnnotationResult if annotated.
 */
async function runPipeline(
  reader: _ZoteroTypes.ReaderInstance,
): Promise<AnnotationResult | null> {
  // Check if auto-annotate is enabled
  if (!getPref("autoAnnotate")) {
    Zotero.debug("[ZPA] Auto-annotate is disabled, skipping");
    return null;
  }

  // Check if API key is configured
  if (!isConfigured()) {
    showNotification(
      "ZPA: No API key configured. Go to Tools → Add-ons → ZPA Preferences.",
    );
    return null;
  }

  // Get the item from the reader
  const itemID = (reader as any).itemID;
  if (!itemID) {
    Zotero.debug("[ZPA] Could not get item ID from reader");
    return null;
  }

  const attachment = await Zotero.Items.getAsync(itemID);
  if (!attachment) {
    Zotero.debug("[ZPA] Could not get attachment item");
    return null;
  }

  // Get the parent item (the library entry)
  const parentItem = attachment.parentItem;
  if (!parentItem) {
    Zotero.debug("[ZPA] Attachment has no parent item");
    return null;
  }

  // Skip check
  if (isAlreadyAnnotated(parentItem)) {
    Zotero.debug("[ZPA] Paper already annotated, skipping");
    return null;
  }

  // Extract text
  let extraction;
  try {
    extraction = await extractText(reader);
  } catch (err) {
    Zotero.debug(`[ZPA] Text extraction failed: ${err}`);
    showNotification("ZPA: Could not extract text from PDF.");
    return null;
  }

  // Check token limit
  const maxTokens = getPref("maxTokenThreshold");
  if (exceedsTokenLimit(extraction.fullText, maxTokens)) {
    showNotification("ZPA: Paper too long to annotate.");
    return null;
  }

  // Call LLM
  showNotification("ZPA: Annotating paper...");
  let llmResponse;
  try {
    llmResponse = await callLLM(extraction.fullText);
  } catch (err) {
    Zotero.debug(`[ZPA] LLM call failed: ${err}`);
    showNotification(`ZPA: Annotation failed — ${err}`);
    return null;
  }

  // Create annotations
  const result = await createAnnotations(
    parentItem,
    attachment.id,
    extraction,
    llmResponse,
  );

  showNotification(
    `ZPA: Created ${result.created} annotations (${result.skipped} skipped).`,
  );
  return result;
}

function showNotification(message: string): void {
  try {
    new ztoolkit.ProgressWindow("Zotero Paper Annotator")
      .createLine({ text: message, type: "default" })
      .show();
  } catch {
    Zotero.debug(`[ZPA] ${message}`);
  }
}

export { runPipeline };
```

- [ ] **Step 2: Modify src/hooks.ts to register the tab notifier**

Replace the template's default hooks with our pipeline trigger. The key integration point is `Zotero.Notifier.registerObserver` for `tab` events — when a new tab is opened, we check if it's a reader tab and run the pipeline.

```typescript
// src/hooks.ts

import { runPipeline } from "./modules/pipeline";

let notifierID: string | undefined;

async function onStartup() {
  await Promise.all([Zotero.initializationPromise, Zotero.unlockPromise]);

  // Register tab notifier to detect PDF opens
  notifierID = Zotero.Notifier.registerObserver(
    {
      notify: async (event: string, type: string, ids: string[] | number[]) => {
        if (type === "tab" && event === "add") {
          // Small delay to let the reader initialize
          await Zotero.Promise.delay(2000);

          for (const id of ids) {
            const reader = Zotero.Reader.getByTabID(String(id));
            if (reader) {
              try {
                await runPipeline(reader);
              } catch (err) {
                Zotero.debug(`[ZPA] Pipeline error: ${err}`);
              }
            }
          }
        }
      },
    },
    ["tab"],
    "zpa-tab-notifier",
  );

  Zotero.debug("[ZPA] Plugin started");
}

function onShutdown() {
  if (notifierID) {
    Zotero.Notifier.unregisterObserver(notifierID);
  }
  Zotero.debug("[ZPA] Plugin shut down");
}

export { onStartup, onShutdown };
```

- [ ] **Step 3: Update src/addon.ts to use our hooks**

Simplify the addon class to just hold our state:

```typescript
// src/addon.ts

import * as hooks from "./hooks";

class Addon {
  public hooks: typeof hooks;

  constructor() {
    this.hooks = hooks;
  }
}

export default Addon;
```

- [ ] **Step 4: Update src/index.ts to wire up the addon**

```typescript
// src/index.ts

import Addon from "./addon";

const addon = new Addon();

// Make addon accessible globally for bootstrap.js
(Zotero as any).ZPA = addon;
```

- [ ] **Step 5: Update addon/bootstrap.js to call our hooks**

The bootstrap file bridges Zotero's plugin lifecycle to our TypeScript hooks:

```javascript
// addon/bootstrap.js

var chromeHandle;

function install(data, reason) {}

async function startup({ id, version, resourceURI, rootURI }, reason) {
  await Zotero.initializationPromise;

  Services.scriptloader.loadSubScript(rootURI + "index.js");

  if (Zotero.ZPA) {
    await Zotero.ZPA.hooks.onStartup();
  }
}

function shutdown({ id, version, resourceURI, rootURI }, reason) {
  if (reason === APP_SHUTDOWN) return;

  if (Zotero.ZPA) {
    Zotero.ZPA.hooks.onShutdown();
  }

  // Clean up
  Zotero.ZPA = undefined;

  Cu.unload(rootURI + "index.js");
}

function uninstall(data, reason) {}
```

- [ ] **Step 6: Verify build**

```bash
npm run build
```

Expected: Build succeeds.

- [ ] **Step 7: Commit**

```bash
git add src/modules/pipeline.ts src/hooks.ts src/addon.ts src/index.ts addon/bootstrap.js
git commit -m "feat: wire up pipeline orchestration with tab notifier"
```

---

### Task 9: Preferences UI

**Files:**

- Create: `addon/prefs.xhtml`
- Modify: `addon/chrome/locale/en-US/addon.ftl`

- [ ] **Step 1: Create addon/prefs.xhtml**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE window>
<vbox xmlns="http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul"
      xmlns:html="http://www.w3.org/1999/xhtml">
  <groupbox>
    <label><html:h2>Zotero Paper Annotator Settings</html:h2></label>

    <hbox align="center">
      <label value="API Key:" style="width: 120px;" />
      <html:input type="password" id="zpa-api-key" style="flex: 1;" />
    </hbox>

    <hbox align="center">
      <label value="API Base URL:" style="width: 120px;" />
      <html:input type="text" id="zpa-api-base-url" style="flex: 1;" />
    </hbox>

    <hbox align="center">
      <label value="Model Name:" style="width: 120px;" />
      <html:input type="text" id="zpa-model-name" style="flex: 1;" />
    </hbox>

    <hbox align="center">
      <label value="Max Tokens:" style="width: 120px;" />
      <html:input type="number" id="zpa-max-tokens" style="flex: 1;" />
    </hbox>

    <hbox align="center">
      <label value="Auto-Annotate:" style="width: 120px;" />
      <checkbox id="zpa-auto-annotate" />
    </hbox>
  </groupbox>
</vbox>
```

- [ ] **Step 2: Add localization strings to addon/chrome/locale/en-US/addon.ftl**

```ftl
# addon/chrome/locale/en-US/addon.ftl
addon-name = Zotero Paper Annotator
prefs-title = ZPA Settings
prefs-api-key = API Key
prefs-api-base-url = API Base URL
prefs-model-name = Model Name
prefs-max-tokens = Max Token Threshold
prefs-auto-annotate = Auto-Annotate on PDF Open
```

- [ ] **Step 3: Verify build**

```bash
npm run build
```

Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add addon/prefs.xhtml addon/chrome/locale/en-US/addon.ftl
git commit -m "feat: add preferences UI panel"
```

---

### Task 10: Manual Integration Test

**Files:** None (testing only)

- [ ] **Step 1: Build the plugin**

```bash
npm run build
```

Expected: `.xpi` file produced in `.scaffold/build/`.

- [ ] **Step 2: Install in Zotero**

1. Open Zotero
2. Go to Tools → Add-ons
3. Click the gear icon → Install Add-on From File
4. Select the `.xpi` file from `.scaffold/build/`
5. Restart Zotero if prompted

Expected: Plugin appears in the add-ons list as "Zotero Paper Annotator".

- [ ] **Step 3: Configure the plugin**

1. Go to Tools → Add-ons → Zotero Paper Annotator → Preferences
2. Enter your DeepSeek API key
3. Verify the default base URL is `https://api.deepseek.com`
4. Verify model name is `deepseek-chat`
5. Ensure Auto-Annotate is checked

- [ ] **Step 4: Test with a short paper**

1. Add a short paper (< 10 pages) to your Zotero library
2. Open the PDF in Zotero's built-in reader
3. Wait for the "Annotating paper..." notification
4. Verify:
   - Color-coded highlights appear in the PDF
   - Each highlight has a comment note
   - A summary note is attached to the item
   - The item has a `zpa-annotated` tag

- [ ] **Step 5: Test skip logic**

1. Close and re-open the same PDF
2. Verify: No "Annotating paper..." notification appears — the paper is skipped

- [ ] **Step 6: Test error handling**

1. Remove the API key from preferences
2. Open a different (un-annotated) PDF
3. Verify: Notification says "No API key configured"

- [ ] **Step 7: Commit any fixes from testing**

```bash
git add -A
git commit -m "fix: adjustments from integration testing"
```
