import fs from 'node:fs';

const path = 'scripts/adjust-finance-overview-layout.mjs';
let text = fs.readFileSync(path, 'utf8');
const marker = "edit('src/tests/finance-exports.test.ts'";
const index = text.indexOf(marker);
if (index < 0) throw new Error('Bloco de teste não encontrado no script temporário.');
text = text.slice(0, index) + `edit('src/tests/finance-exports.test.ts', (source) => {
  let next = source;
  next = replaceOnce(
    next,
    \`    expect(stores?.getCell('O1').value).toBe('Dif. Em Relação a Verba');\\n    expect(stores?.getCell('O2').value).toBe(34_215);\`,
    \`    expect(stores?.getCell('O1').value).toBe('Dif. Em Relação a Verba');\\n    expect(stores?.getCell('O2').value).toBe(34_215);\\n    expect(stores?.getCell('P1').value).toBe('Pago');\\n    expect(stores?.getCell('Q1').value).toBe('Saldo a pagar');\\n    expect(stores?.getCell('R1').value).toBe('Documentação');\\n    expect(stores?.getCell('R2').value).toBe('Parcial');\\n    expect(stores?.getCell('E1').fill).toMatchObject({ fgColor: { argb: 'FFDDEBFA' } });\\n    expect(stores?.getCell('K1').fill).toMatchObject({ fgColor: { argb: 'FFDDF3E7' } });\\n    expect(stores?.getCell('P1').fill).toMatchObject({ fgColor: { argb: 'FFFDEACF' } });\\n    expect(stores?.getCell('R1').fill).toMatchObject({ fgColor: { argb: 'FFEFF2F0' } });\`,
    'teste visual do Excel',
  );
  return next;
});
`;
fs.writeFileSync(path, text);
console.log('Bloco de teste do ajuste visual atualizado.');
