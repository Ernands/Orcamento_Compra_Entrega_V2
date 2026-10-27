import type { AuditDocument, FiscalReading } from '../domain/document-audit-types';
import { emptyReading, readFiscalText, readFiscalXml } from '../domain/fiscal-document-reading';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { Worker as OcrWorker } from 'tesseract.js';

export interface FiscalReader {
  read: (bytes: ArrayBuffer, document: AuditDocument) => Promise<FiscalReading>;
  dispose: () => Promise<void>;
}

export function createFiscalReader(options: {
  ocr: boolean;
  signal?: AbortSignal;
  progress?: (message: string) => void;
}): FiscalReader {
  let ocrWorker: OcrWorker | null = null;
  const checkAbort = () => {
    if (options.signal?.aborted) throw new Error('Geração cancelada.');
  };
  const dispose = async () => {
    const worker = ocrWorker;
    ocrWorker = null;
    if (worker) await worker.terminate();
  };
  options.signal?.addEventListener(
    'abort',
    () => {
      void dispose();
    },
    { once: true },
  );
  const recognize = async (image: Blob | HTMLCanvasElement): Promise<string> => {
    checkAbort();
    if (!ocrWorker) {
      const { createWorker, OEM } = await import('tesseract.js');
      const base = new URL(`${import.meta.env.BASE_URL}fiscal-ocr/`, window.location.origin).href;
      ocrWorker = await createWorker('por', OEM.LSTM_ONLY, {
        workerPath: `${base}worker.min.js`,
        corePath: base,
        langPath: `${base}lang`,
        workerBlobURL: false,
        cacheMethod: 'none',
        logger: (event) =>
          options.progress?.(`OCR: ${event.status} (${Math.round((event.progress || 0) * 100)}%)`),
      });
    }
    checkAbort();
    const { data } = await ocrWorker.recognize(image);
    return data.text;
  };
  return {
    dispose,
    read: async (bytes, doc) => {
      checkAbort();
      const prefix = new TextDecoder().decode(bytes.slice(0, 200));
      if (
        /\.xml$/i.test(doc.name) ||
        /xml/i.test(doc.mimeType || '') ||
        /^\s*(?:<\?xml|<nfeProc|<NFe)/.test(prefix)
      ) {
        const encoding = prefix.match(/encoding=["']([^"']+)["']/i)?.[1] || 'utf-8';
        return readFiscalXml(new TextDecoder(encoding).decode(bytes));
      }
      if (prefix.startsWith('%PDF-')) {
        const pdfjs = await import('pdfjs-dist');
        pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
        const loading = pdfjs.getDocument({
          data: new Uint8Array(bytes.slice(0)),
          useSystemFonts: true,
        });
        const pdf = await loading.promise;
        let usedOcr = false;
        const pages: string[] = [];
        const warnings: string[] = [];
        try {
          const limit = Math.min(pdf.numPages, 50);
          if (pdf.numPages > limit)
            warnings.push(
              `PDF contém ${pdf.numPages} páginas; limite de leitura automática de 50 páginas atingido. Conferir páginas restantes no original.`,
            );
          for (let index = 1; index <= limit; index++) {
            checkAbort();
            options.progress?.(`Lendo ${doc.name} · página ${index}/${pdf.numPages}`);
            const page = await pdf.getPage(index);
            const text = await page.getTextContent();
            const tokens = text.items.filter(
              (item): item is typeof item & { str: string; transform: number[] } => 'str' in item,
            );
            tokens.sort((a, b) =>
              Math.abs(a.transform[5] - b.transform[5]) < 3
                ? a.transform[4] - b.transform[4]
                : b.transform[5] - a.transform[5],
            );
            let previousY: number | null = null;
            let content = tokens
              .map((token) => {
                const separator =
                  previousY === null || Math.abs(previousY - token.transform[5]) < 3 ? ' ' : '\n';
                previousY = Number(token.transform[5]);
                return `${separator}${token.str}`;
              })
              .join('');
            if (content.replace(/\s/g, '').length < 50 && options.ocr) {
              const viewport = page.getViewport({ scale: 2 });
              const canvas = document.createElement('canvas');
              canvas.width = Math.ceil(viewport.width);
              canvas.height = Math.ceil(viewport.height);
              await page.render({ canvas, viewport }).promise;
              content = await recognize(canvas);
              usedOcr = true;
              canvas.width = 0;
              canvas.height = 0;
            } else if (content.replace(/\s/g, '').length < 50)
              warnings.push(`Página ${index} sem texto suficiente; OCR desativado.`);
            pages.push(`PÁGINA ${index}\n${content}`);
            page.cleanup();
          }
        } finally {
          await loading.destroy();
        }
        const result = readFiscalText(pages.join('\n\n'), usedOcr ? 'ocr' : 'pdf_text');
        result.warnings.push(...warnings);
        return result;
      }
      if (/^image\//i.test(doc.mimeType || '') || /\.(png|jpe?g|webp|bmp|tiff?)$/i.test(doc.name)) {
        if (!options.ocr)
          return emptyReading(
            'unsupported',
            'Imagem não lida: OCR desativado. O arquivo original foi preservado.',
          );
        return readFiscalText(
          await recognize(new Blob([bytes], { type: doc.mimeType || 'image/png' })),
          'ocr',
        );
      }
      return emptyReading(
        'unsupported',
        'Formato sem leitor automático disponível. Consulte o arquivo original.',
      );
    },
  };
}
