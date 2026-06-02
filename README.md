# Zotero Paper Annotator

A Zotero 7 plugin that automatically annotates academic papers with LLM-powered highlights and summaries. When you open a PDF, the plugin extracts the text, sends it to OpenRouter by default (or another OpenAI-compatible endpoint), and creates color-coded highlight annotations directly on the PDF.

## Features

- **Automatic annotation** -- highlights are created when you open a PDF, no manual trigger needed
- **Color-coded categories** -- annotations are categorized and colored by type:
  - Key Findings (yellow)
  - Methodology (blue)
  - Conclusions (green)
  - Limitations (orange)
- **Summary note** -- a concise summary is added as a note on the parent item
- **Smart skip** -- papers that have already been annotated are skipped automatically
- **Fuzzy text matching** -- quotes are matched to PDF positions using Unicode normalization and Levenshtein distance fallback
- **Configurable** -- API endpoint, model, token limits, and auto-annotate toggle are all adjustable in preferences
- **OpenRouter-first, OpenAI-compatible** -- defaults to OpenRouter while keeping the endpoint and model configurable for other providers that support chat completions

## Requirements

- Zotero 7 or later
- An API key from [OpenRouter](https://openrouter.ai/) (or another OpenAI-compatible provider)

## Installation

1. Download the latest `.xpi` file from the [Releases](https://github.com/SpicyChicken6/zotero-paper-annotator/releases) page
2. In Zotero, go to **Tools > Add-ons**
3. Click the gear icon and select **Install Add-on From File...**
4. Select the downloaded `.xpi` file

## Setup

1. Go to **Edit > Settings > Zotero Paper Annotator** (or **Zotero > Settings** on macOS)
2. Enter your OpenRouter API key
3. (Optional) Adjust other settings:
   - **API Base URL** -- default: `https://openrouter.ai/api`
   - **Model Slug** -- default: `deepseek/deepseek-v4-flash`
   - **Max Token Threshold** -- default: `120000` (papers exceeding this are skipped)
   - **Auto-annotate** -- enabled by default; disable to prevent automatic annotation on PDF open

The plugin appends `/v1/chat/completions` to the configured base URL. If you use OpenRouter, keep the default base URL as `https://openrouter.ai/api`; entering `https://openrouter.ai/api/v1` is also normalized safely. The request uses `response_format: { "type": "json_object" }`; OpenRouter supports this parameter, but model support can vary, so choose a model that supports JSON mode if you change the default.

## Usage

Simply open a PDF in Zotero. If auto-annotate is enabled and the paper hasn't been annotated yet, the plugin will:

1. Extract text from the PDF
2. Send it to the configured LLM API
3. Create color-coded highlight annotations at the relevant positions
4. Add a summary note to the parent item
5. Tag the item with `zpa-annotated` to prevent re-annotation

To re-annotate a paper, remove the `zpa-annotated` tag from the item and reopen the PDF.

## Development

### Prerequisites

- [Node.js](https://nodejs.org/) (LTS)
- [Zotero 7](https://www.zotero.org/support/beta_builds) installed locally

### Setup

```bash
git clone https://github.com/SpicyChicken6/zotero-paper-annotator.git
cd zotero-paper-annotator
npm install
```

Copy `.env.example` to `.env` and set the paths to your local Zotero installation:

```bash
cp .env.example .env
# Edit .env with your Zotero binary and profile paths
```

### Scripts

| Command              | Description                         |
| -------------------- | ----------------------------------- |
| `npm start`          | Start dev server with hot reload    |
| `npm run build`      | Build for production                |
| `npm run lint:check` | Check formatting and lint rules     |
| `npm run lint:fix`   | Auto-fix formatting and lint issues |
| `npm test`           | Run tests                           |
| `npm run release`    | Create a GitHub release             |

### Project Structure

```
src/
  index.ts                  # Plugin entry point
  addon.ts                  # Addon singleton state
  hooks.ts                  # Zotero lifecycle hooks & tab notifier
  modules/
    pipeline.ts             # Main orchestration flow
    llmClient.ts            # OpenRouter/OpenAI-compatible API client
    pdfExtractor.ts         # PDF.js text extraction with coordinates
    annotator.ts            # Zotero annotation creation
    textMatcher.ts          # Fuzzy quote-to-position matching
    skipCheck.ts            # Already-annotated detection
    preferenceScript.ts     # Preferences UI binding
  utils/
    prefs.ts                # Preference read/write helpers
    tokenEstimator.ts       # Token count heuristic
    locale.ts               # i18n/localization
    ztoolkit.ts             # ZoteroToolkit initialization
    window.ts               # Window state utilities
addon/
  bootstrap.js              # Firefox addon bootstrap
  manifest.json             # Plugin manifest
  prefs.js                  # Default preference values
  content/                  # UI files (preferences XHTML, CSS, icons)
  locale/en-US/             # Localization strings
```

## Data Flow

The following diagram illustrates how data flows through the plugin modules when you open a PDF:

```
PDF opens in Zotero
        │
        ▼
hooks.ts: tab notifier fires
        │
        ▼
pipeline.ts: runPipeline(reader)
        │
        ├── skipCheck.isAlreadyAnnotated() ──► skip if tagged
        │
        ├── pdfExtractor.extractText(reader) ──► { fullText, pages[] }
        │
        ├── tokenEstimator.exceedsTokenLimit()
        │
        ├── llmClient.callLLM(fullText) ──► { summary, annotations[] }
        │
        └── annotator.createAnnotations(...)
              ├── For each annotation:
              │     textMatcher.findQuoteInPage() ──► rects
              │     → save Zotero annotation item (highlight + color + position)
              │
              ├── saveSummaryNote() ──► HTML note on parent item
              │
              └── skipCheck.markAsAnnotated() ──► add "zpa-annotated" tag
```

## License

[MIT](LICENSE)
