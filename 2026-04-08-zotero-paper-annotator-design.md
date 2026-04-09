# Zotero Paper Annotator (ZPA) — Design Spec

## Overview

A Zotero 7/8 plugin that automatically annotates academic papers when opened in the built-in PDF reader. It uses the DeepSeek API (or any OpenAI-compatible API) to identify key passages, highlight them with color-coded categories, attach short explanatory notes, and generate an overall paper summary.

Inspired by [annotateai](https://github.com/neuml/annotateai), adapted for the Zotero ecosystem.

## Core Behavior

1. User opens a PDF in Zotero's built-in reader.
2. Plugin checks if the paper is already annotated (via `zpa-annotated` tag on the item). If yes, skip.
3. Plugin extracts text content with page numbers and positions from the PDF reader.
4. If the paper exceeds the model's context window, skip with a notification ("Paper too long to annotate").
5. Plugin sends extracted text to DeepSeek API with a structured prompt.
6. LLM returns JSON with an overall summary and a list of passages to annotate.
7. Plugin fuzzy-matches each quoted passage back to the PDF text to find exact positions.
8. Plugin creates Zotero highlight annotations with color-coded categories and attached notes.
9. Plugin creates a standalone Zotero note on the item with the overall paper summary.
10. Plugin adds the `zpa-annotated` tag to the item.

## Architecture

Built on the [zotero-plugin-template](https://github.com/windingwind/zotero-plugin-template) (TypeScript, hot-reload, esbuild).

### Project Structure

```
zotero-paper-annotator/
├── src/
│   ├── hooks.ts            # Zotero lifecycle hooks (startup, shutdown, PDF open event)
│   ├── modules/
│   │   ├── pdfExtractor.ts # Extract text + positions from the open PDF
│   │   ├── llmClient.ts    # DeepSeek API client (send text, get structured annotations)
│   │   ├── annotator.ts    # Map LLM output to Zotero annotations (highlights, notes)
│   │   └── skipCheck.ts    # Detect if paper is already annotated, skip if so
│   ├── utils/
│   │   └── preferences.ts  # Plugin settings (API key, model, colors)
│   └── addon.ts            # Plugin initialization and registration
├── addon/
│   ├── bootstrap.js        # Zotero bootstrap entry point
│   ├── manifest.json       # Plugin metadata
│   └── chrome/locale/      # Localization strings
```

### Module Responsibilities

**hooks.ts** — Registers a listener for the PDF reader open event. On open, orchestrates the pipeline: skip check -> extract -> LLM call -> annotate.

**pdfExtractor.ts** — Accesses the Zotero PDF reader instance (PDF.js-based) to extract text content page by page, preserving page numbers and approximate character positions.

**llmClient.ts** — Sends extracted text to the DeepSeek API. Handles the HTTP request, parses the structured JSON response, and validates the response schema. Uses `fetch` with the configured API base URL, key, and model.

**annotator.ts** — Takes the LLM's structured output and creates Zotero annotations. For each passage: fuzzy-matches the quote against extracted text to find the correct page and position, creates a highlight annotation with the appropriate color, attaches the note as a comment. Also creates the item-level summary note and adds the `zpa-annotated` tag.

**skipCheck.ts** — Checks if a Zotero item has the `zpa-annotated` tag. Returns a boolean to short-circuit the pipeline.

**preferences.ts** — Reads and writes plugin preferences from Zotero's preference system. Provides defaults for all settings.

### Data Flow

```
PDF opened in reader
       |
       v
skipCheck: has `zpa-annotated` tag?
       |
      no
       |
       v
pdfExtractor: extract text + positions per page
       |
       v
token count > threshold? --yes--> notify "too long", stop
       |
      no
       |
       v
llmClient: send text to DeepSeek API
       |
       v
parse structured JSON response
       |
       v
annotator: for each annotation
  - fuzzy match quote to PDF position
  - create Zotero highlight (color by category)
  - attach note comment
       |
       v
annotator: create item-level summary note
       |
       v
add `zpa-annotated` tag to item
```

## LLM Interaction

### Prompt Design

The system prompt instructs the LLM to analyze the paper and return structured JSON. The user message contains the full extracted text.

### Response Schema

```json
{
  "summary": "Overall paper summary in 2-3 sentences.",
  "annotations": [
    {
      "page": 3,
      "quote": "exact text passage from the paper to highlight",
      "category": "key_finding",
      "note": "Short explanation of why this passage matters"
    }
  ]
}
```

### Annotation Categories and Colors

| Category      | Color  | Purpose                           |
| ------------- | ------ | --------------------------------- |
| `key_finding` | Yellow | Important results and discoveries |
| `methodology` | Blue   | Methods and experimental design   |
| `conclusion`  | Green  | Conclusions and implications      |
| `limitation`  | Orange | Limitations and caveats           |

## Text Matching

The LLM returns exact quotes from the paper. To place highlights accurately:

1. Search for the quote on the specified page using fuzzy string matching.
2. Fuzzy matching handles minor discrepancies: whitespace normalization, hyphenation differences, minor OCR artifacts.
3. If a quote cannot be matched, skip that individual annotation and proceed with the rest.

## Skip Logic

Each paper annotated by the plugin gets a `zpa-annotated` tag added to the Zotero item. On PDF open:

1. Look up the item associated with the opened PDF.
2. Check if it has the `zpa-annotated` tag.
3. If tagged, do nothing.
4. If not tagged, run the annotation pipeline. Add the tag only after all annotations are successfully created.

## Settings

Accessible via Zotero's plugin preferences panel.

### Required

- **API Key** — DeepSeek API key, stored in Zotero preferences.
- **API Base URL** — Defaults to DeepSeek's endpoint (`https://api.deepseek.com`). Configurable for other OpenAI-compatible APIs.

### Optional

- **Model name** — Defaults to `deepseek-chat`.
- **Max token threshold** — Paper length cutoff for skipping. Default based on model's context window.
- **Highlight colors** — Customizable color mapping for the four categories.
- **Auto-annotate toggle** — On/off switch to temporarily disable automatic annotation.

## Error Handling

- **Paper too long**: Show a Zotero notification, skip annotation entirely.
- **API failure** (network error, rate limit, invalid response): Show a notification with the error, do not create partial annotations, do not add the `zpa-annotated` tag (so re-annotation can be attempted next time).
- **Quote not found in PDF**: Skip that individual annotation, proceed with the rest. Log a warning.
- **No API key configured**: Show a notification directing the user to plugin settings.

## Technology Stack

- **Language**: TypeScript
- **Build**: esbuild via zotero-plugin-template
- **Zotero compatibility**: Zotero 7+
- **LLM API**: OpenAI-compatible HTTP API (DeepSeek as default)
- **Text matching**: Fuzzy string matching library (e.g., fuse.js or custom Levenshtein-based)

## Out of Scope (for v1)

- Local/offline LLM support
- User-provided keywords or focus areas
- Re-annotation or annotation updates
- Chunking for long papers
- Batch annotation of multiple papers
- Chat or Q&A interface
