# Paragraph Summaries Design

## Goal

Change the add-on from selective "top passages" annotation to paragraph-aware annotation: each substantial paragraph should receive a concise summary comment written in the context of the whole paper.

## Scope

- Summarize every substantial body paragraph that the extractor can identify.
- Keep one whole-paper summary note on the parent item.
- Store each paragraph summary as a Zotero highlight annotation comment.
- Highlight a short representative quote from the paragraph rather than the entire paragraph.
- Avoid letting old `zpa-annotated` selective runs block the new paragraph-summary pass.

## Architecture

PDF extraction will expose paragraph metadata in addition to page text and positioned text items. Zotero 9 `getPageData()` already marks `paragraphBreakAfter`, so the extractor will group word items into stable paragraph records with IDs such as `p0001`.

The pipeline will filter extracted paragraphs to substantial paragraphs and format the LLM input as an ordered paragraph list. This preserves whole-paper context because the model receives all substantial paragraphs in paper order, but it also gives each paragraph a stable ID.

The LLM response will keep the existing `summary` field and return `annotations`, where each annotation maps to one paragraph:

```json
{
  "summary": "Whole-paper summary",
  "annotations": [
    {
      "paragraphId": "p0001",
      "page": 1,
      "quote": "A short exact quote from this paragraph.",
      "category": "key_finding",
      "note": "One or two sentences summarizing this paragraph in whole-paper context."
    }
  ]
}
```

The annotator will prefer `paragraphId` when matching annotations, using the paragraph's text and positioned items to create the highlight. Existing page-based matching remains as a fallback.

## Filtering

The first version will filter by a configurable minimum paragraph length. The default minimum will be conservative enough to avoid headers and fragments while still keeping typical academic body paragraphs. Reference-list and table-specific heuristics are intentionally out of scope for this pass.

## State Tagging

The new paragraph mode will mark processed PDFs with `zpa-paragraph-summarized`. The existing `zpa-annotated` tag remains for older selective runs. This prevents old runs from making the new mode appear to do nothing, while still allowing retry if a paragraph-summary run added a tag but no annotations.

## Testing

- Extractor tests will prove Zotero 9 character data becomes paragraphs with stable IDs, page labels, text, and positioned items.
- Paragraph filtering/formatting tests will prove short fragments are omitted and paragraph IDs are preserved in LLM input.
- LLM client tests will prove the prompt asks for one annotation per provided paragraph and includes paragraph IDs in the user message.
- Annotator tests will prove paragraph-ID annotations match against paragraph text/items and mark the paragraph-summary tag.
- Existing OpenRouter URL/header behavior and Zotero 9 annotation saving tests must remain green.
