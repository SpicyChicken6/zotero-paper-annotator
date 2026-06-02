# Paragraph Summaries Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the annotation flow to summarize each substantial paragraph in whole-paper context.

**Architecture:** Extend extraction to include paragraph records, filter/format those records for the LLM, update the prompt/response contract to include paragraph IDs, and teach the annotator to match paragraph-ID annotations. Use a paragraph-specific completion tag so old selective runs do not block the new pass.

**Tech Stack:** TypeScript, Zotero 9 reader `getPageData()`, OpenRouter chat completions, Mocha/Chai, esbuild for bundled Node tests.

---

### Task 1: Paragraph Extraction

**Files:**
- Modify: `src/modules/pdfExtractor.ts`
- Test: `test/pdfExtractor.test.ts`

- [ ] Add `ParagraphText` type with `id`, `pageIndex`, `pageLabel`, `indexOnPage`, `text`, and `items`.
- [ ] Write a failing test showing `paragraphBreakAfter` splits Zotero 9 page data into two paragraphs with stable IDs.
- [ ] Implement paragraph grouping in the Zotero 9 extraction path.
- [ ] Keep PDF.js fallback working by exposing each fallback page as one paragraph.

### Task 2: Paragraph Filtering And Formatting

**Files:**
- Create: `src/modules/paragraphs.ts`
- Create: `test/paragraphs.test.ts`
- Modify: `addon/prefs.js`
- Modify: `typings/prefs.d.ts`

- [ ] Add `minParagraphChars` default preference.
- [ ] Write failing tests for filtering short fragments and formatting paragraph IDs/page labels in LLM input.
- [ ] Implement `getSubstantialParagraphs()` and `formatParagraphsForLLM()`.

### Task 3: LLM Paragraph Prompt

**Files:**
- Modify: `src/modules/llmClient.ts`
- Modify: `test/llmClient.test.ts`

- [ ] Write a failing test that the request body asks for one annotation per provided paragraph and sends paragraph IDs.
- [ ] Update the system prompt/schema to require `paragraphId` and paragraph-context summaries.
- [ ] Keep OpenRouter URL normalization, headers, JSON mode, and error handling unchanged.

### Task 4: Paragraph-Aware Annotation Saving

**Files:**
- Modify: `src/modules/annotator.ts`
- Modify: `src/modules/skipCheck.ts`
- Modify: `test/annotator.test.ts`
- Modify: `test/skipCheck.test.ts`

- [ ] Add `zpa-paragraph-summarized` tag support.
- [ ] Write failing tests for matching an annotation by `paragraphId` and marking the paragraph tag.
- [ ] Implement paragraph-ID matching with page fallback preserved.

### Task 5: Pipeline Integration And Verification

**Files:**
- Modify: `src/modules/pipeline.ts`
- Modify: `README.md`
- Test: focused Mocha suites and build/lint scripts.

- [ ] Filter extracted paragraphs before calling the LLM.
- [ ] Send formatted paragraph input to the LLM.
- [ ] Use paragraph-summary skip/mark tag in the pipeline.
- [ ] Update README to explain paragraph summaries and the new tag.
- [ ] Run `npm run build`, `npm run lint:check`, focused Mocha tests, bundled LLM/annotator tests, and `npm run build:release`.
