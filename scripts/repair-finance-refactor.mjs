import fs from 'node:fs';

const path = 'scripts/refactor-finance-groups.mjs';
let text = fs.readFileSync(path, 'utf8');
const oldText = "  summary.addRow([`1 Onda - ${input.rows.length} lojas`]);\\n";
const newText = "  summary.addRow(['1 Onda - ' + input.rows.length + ' lojas']);\\n";
if (!text.includes(oldText)) throw new Error('Trecho temporário para correção não encontrado.');
text = text.replace(oldText, newText);
fs.writeFileSync(path, text);
console.log('Script temporário corrigido.');
