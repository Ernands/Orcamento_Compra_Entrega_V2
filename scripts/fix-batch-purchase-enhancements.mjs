import fs from 'node:fs';
const path = 'src/pages/supply-purchases-page.tsx';
let source = fs.readFileSync(path, 'utf8');

const oldReset = `    setFile(null);\n    setDocumentType('invoice');\n    setDocumentNumber('');\n    setDocumentDescription('');\n`;
if (!source.includes(oldReset)) throw new Error('reset legado nao encontrado');
source = source.replace(oldReset, `    setAttachments([purchaseAttachmentDraft()]);\n    nextAttachmentKey.current = 2;\n`);

const oldMap = `attachment.files.map((attachmentFile, fileIndex) => ({ attachment, attachmentFile, fileIndex }))`;
const mapCount = source.split(oldMap).length - 1;
if (mapCount !== 2) throw new Error(`esperava 2 maps de anexo, encontrei ${mapCount}`);
source = source.split(oldMap).join(`attachment.files.map((attachmentFile) => ({ attachment, attachmentFile }))`);

const oldLoop = `for (const { attachment, attachmentFile, fileIndex } of attachmentsToUpload) {`;
const loopCount = source.split(oldLoop).length - 1;
if (loopCount !== 2) throw new Error(`esperava 2 loops de anexo, encontrei ${loopCount}`);
source = source.split(oldLoop).join(`for (const [uploadIndex, { attachment, attachmentFile }] of attachmentsToUpload.entries()) {`);

const oldAmount = `documentAmount: fileIndex === 0 && total !== null ? centsToInput(total) : '',`;
const amountCount = source.split(oldAmount).length - 1;
if (amountCount !== 2) throw new Error(`esperava 2 valores documentais, encontrei ${amountCount}`);
source = source.split(oldAmount).join(`documentAmount: uploadIndex === 0 && total !== null ? centsToInput(total) : '',`);

fs.writeFileSync(path, source);
console.log('correcao aplicada');
