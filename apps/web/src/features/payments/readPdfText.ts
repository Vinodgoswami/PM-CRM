/**
 * D-040: the text of a PDF, read in the browser with pdf.js (nothing is uploaded to read it). Loaded only when a PDF
 * is chosen, so it adds nothing to the first page load. A scan or photo has no text and returns ''.
 */
export async function readPdfText(file: File, maxPages = 5): Promise<string> {
  const pdfjs = await import('pdfjs-dist');
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false }).promise;
  const lines: string[] = [];
  for (let n = 1; n <= Math.min(doc.numPages, maxPages); n++) {
    const content = await (await doc.getPage(n)).getTextContent();
    // Keep line breaks where pdf.js marks the end of a line, so "Label: value" pairs stay together.
    let line = '';
    for (const item of content.items) {
      if (!('str' in item)) continue;
      line += item.str + (item.hasEOL ? '\n' : ' ');
    }
    lines.push(line);
  }
  await doc.destroy();
  return lines.join('\n');
}
