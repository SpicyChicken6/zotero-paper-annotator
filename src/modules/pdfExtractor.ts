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
function getPDFDocument(reader: _ZoteroTypes.ReaderInstance): any | null {
  try {
    const internalReader = (reader as any)._internalReader;
    if (!internalReader) return null;
    const primaryView = internalReader._primaryView;
    if (!primaryView) return null;
    const iframe = primaryView._iframe;
    if (!iframe) return null;
    const iframeWindow =
      iframe.contentWindow?.wrappedJSObject || iframe.contentWindow;
    if (!iframeWindow) return null;
    return iframeWindow.PDFViewerApplication?.pdfDocument || null;
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

  const numPages: number = pdfDocument.numPages;
  const pages: PageText[] = [];
  const fullTextParts: string[] = [];

  for (let i = 1; i <= numPages; i++) {
    const page = await pdfDocument.getPage(i);
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
