import fs from 'node:fs';

const path = 'scripts/adjust-finance-overview-layout.mjs';
let text = fs.readFileSync(path, 'utf8');
text = text.replaceAll('${', '\\${');
fs.writeFileSync(path, text);
console.log('Escapes do script de ajuste visual corrigidos.');
