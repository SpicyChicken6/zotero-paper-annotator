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

interface PDFDocumentContext {
  pdfDocument: any;
  iframeWindow: any;
}

interface ZoteroPageChar {
  c?: string;
  u?: string;
  rect?: number[];
  inlineRect?: number[];
  ignorable?: boolean;
  spaceAfter?: boolean;
  lineBreakAfter?: boolean;
  paragraphBreakAfter?: boolean;
}

interface ZoteroPageData {
  chars?: ZoteroPageChar[];
}

/**
 * Get the PDF.js document context from a Zotero reader instance.
 * Accesses internal reader structure — may need adjustment across Zotero versions.
 */
function getPDFDocumentContext(
  reader: _ZoteroTypes.ReaderInstance,
): PDFDocumentContext | null {
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
    const pdfDocument = iframeWindow.PDFViewerApplication?.pdfDocument;
    return pdfDocument ? { pdfDocument, iframeWindow } : null;
  } catch {
    return null;
  }
}

/**
 * Get the PDF.js document from a Zotero reader instance.
 * Accesses internal reader structure — may need adjustment across Zotero versions.
 */
function getPDFDocument(reader: _ZoteroTypes.ReaderInstance): any | null {
  return getPDFDocumentContext(reader)?.pdfDocument ?? null;
}

function cloneIntoReaderWindow<T>(value: T, iframeWindow: any): T {
  const components = (globalThis as any).Components;
  const cloneInto = components?.utils?.cloneInto;

  if (typeof cloneInto === "function" && iframeWindow) {
    return cloneInto(value, iframeWindow);
  }

  return value;
}

function unionRect(
  a: [number, number, number, number],
  b: [number, number, number, number],
): [number, number, number, number] {
  return [
    Math.min(a[0], b[0]),
    Math.min(a[1], b[1]),
    Math.max(a[2], b[2]),
    Math.max(a[3], b[3]),
  ];
}

function toRect(rect: number[] | undefined): [number, number, number, number] {
  if (Array.isArray(rect) && rect.length >= 4) {
    return [rect[0], rect[1], rect[2], rect[3]];
  }
  return [0, 0, 0, 0];
}

function rectToTextItem(
  str: string,
  rect: [number, number, number, number],
): TextItem {
  return {
    str,
    x: rect[0],
    y: rect[1],
    width: rect[2] - rect[0],
    height: rect[3] - rect[1],
  };
}

function textItemsFromZoteroPageData(pageData: ZoteroPageData): TextItem[] {
  const items: TextItem[] = [];
  let currentText = "";
  let currentRect: [number, number, number, number] | null = null;

  const flush = () => {
    if (currentText.length > 0 && currentRect) {
      items.push(rectToTextItem(currentText, currentRect));
    }
    currentText = "";
    currentRect = null;
  };

  for (const char of pageData.chars ?? []) {
    if (char.ignorable) {
      continue;
    }

    const text = char.c ?? char.u ?? "";
    if (text.length === 0) {
      continue;
    }

    const rect = toRect(char.inlineRect ?? char.rect);
    currentText += text;
    currentRect = currentRect ? unionRect(currentRect, rect) : rect;

    if (char.spaceAfter || char.lineBreakAfter || char.paragraphBreakAfter) {
      flush();
    }
  }
  flush();

  return items;
}

async function getPageLabels(pdfDocument: any, numPages: number) {
  if (typeof pdfDocument.getPageLabels2 !== "function") {
    return [];
  }

  try {
    const labels = await pdfDocument.getPageLabels2();
    return Array.isArray(labels) && labels.length === numPages ? labels : [];
  } catch {
    return [];
  }
}

async function extractPageViaZoteroPageData(
  pdfDocument: any,
  iframeWindow: any,
  pageIndex: number,
  pageLabel: string,
): Promise<PageText | null> {
  if (typeof pdfDocument.getPageData !== "function") {
    return null;
  }

  const pageData = await pdfDocument.getPageData(
    cloneIntoReaderWindow({ pageIndex }, iframeWindow),
  );
  const items = textItemsFromZoteroPageData(pageData);
  const text = items.map((item) => item.str).join(" ");

  return {
    pageIndex,
    pageLabel,
    text,
    items,
  };
}

async function extractPageViaPDFJS(
  pdfDocument: any,
  pageIndex: number,
  pageLabel: string,
): Promise<PageText> {
  const page = await pdfDocument.getPage(pageIndex + 1);
  const textContent = await page.getTextContent();

  const items: TextItem[] = textContent.items
    .filter((item: any) => typeof item.str === "string" && item.str.length > 0)
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

  return {
    pageIndex,
    pageLabel,
    text: items.map((item) => item.str).join(" "),
    items,
  };
}

/**
 * Extract text content with positions from all pages of a PDF.
 */
async function extractText(
  reader: _ZoteroTypes.ReaderInstance,
): Promise<ExtractionResult> {
  const context = getPDFDocumentContext(reader);
  if (!context) {
    throw new Error("Could not access PDF document from reader");
  }
  const { pdfDocument, iframeWindow } = context;

  const numPages: number = pdfDocument.numPages;
  const pageLabels = await getPageLabels(pdfDocument, numPages);
  const pages: PageText[] = [];
  const fullTextParts: string[] = [];

  for (let i = 0; i < numPages; i++) {
    const pageLabel = pageLabels[i] ?? String(i + 1);
    const page =
      (await extractPageViaZoteroPageData(
        pdfDocument,
        iframeWindow,
        i,
        pageLabel,
      )) ?? (await extractPageViaPDFJS(pdfDocument, i, pageLabel));

    pages.push(page);
    fullTextParts.push(`[Page ${pageLabel}]\n${page.text}`);
  }

  return {
    fullText: fullTextParts.join("\n\n"),
    pages,
  };
}

export { extractText, getPDFDocument, textItemsFromZoteroPageData };
export type { TextItem, PageText, ExtractionResult };
