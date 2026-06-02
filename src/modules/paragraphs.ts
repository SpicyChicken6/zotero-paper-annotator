import type { ExtractionResult, ParagraphText } from "./pdfExtractor";

function getSubstantialParagraphs(
  extraction: ExtractionResult,
  minParagraphChars: number,
): ParagraphText[] {
  const minLength = Math.max(0, Math.floor(minParagraphChars));

  return extraction.paragraphs.filter(
    (paragraph) => paragraph.text.trim().length >= minLength,
  );
}

function formatParagraphsForLLM(paragraphs: ParagraphText[]): string {
  return paragraphs
    .map((paragraph) => {
      return [
        `[Paragraph ${paragraph.id} | Page ${paragraph.pageLabel}]`,
        paragraph.text.trim(),
      ].join("\n");
    })
    .join("\n\n");
}

export { formatParagraphsForLLM, getSubstantialParagraphs };
