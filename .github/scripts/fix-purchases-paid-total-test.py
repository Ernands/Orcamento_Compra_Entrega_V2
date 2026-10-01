from pathlib import Path

path = Path('src/tests/supply-purchases-page.test.tsx')
text = path.read_text(encoding='utf-8')
old = "    expect(screen.getByText(/pago vinculado R\\$ 400,00/)).toBeInTheDocument();\n"
new = "    expect(screen.getByText('Total pago')).toBeInTheDocument();\n    expect(screen.getAllByText('R$ 400,00').length).toBeGreaterThan(0);\n"
if old not in text:
    raise SystemExit('stale linked-paid assertion not found')
path.write_text(text.replace(old, new, 1), encoding='utf-8')
