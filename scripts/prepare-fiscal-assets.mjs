import { copyFile, mkdir, readdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = resolve(root, 'public/fiscal-ocr');
await mkdir(resolve(target, 'lang'), { recursive: true });
await copyFile(
  resolve(root, 'node_modules/tesseract.js/dist/worker.min.js'),
  resolve(target, 'worker.min.js'),
);
for (const name of await readdir(resolve(root, 'node_modules/tesseract.js-core'))) {
  if (/^tesseract-core(?:-(?:relaxedsimd|simd))?-lstm\.wasm(?:\.js)?$/.test(name)) {
    await copyFile(resolve(root, 'node_modules/tesseract.js-core', name), resolve(target, name));
  }
}
await copyFile(
  resolve(root, 'node_modules/@tesseract.js-data/por/4.0.0_best_int/por.traineddata.gz'),
  resolve(target, 'lang/por.traineddata.gz'),
);
console.log('Recursos de OCR fiscal preparados para processamento local no navegador.');
