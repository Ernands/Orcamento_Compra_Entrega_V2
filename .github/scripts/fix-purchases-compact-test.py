from pathlib import Path

path = Path('src/tests/supply-purchases-page.test.tsx')
text = path.read_text(encoding='utf-8')
old = "    expect(screen.queryByText('Cadeira operacional')).not.toBeInTheDocument();\n\n"
if old not in text:
    raise SystemExit('compact assertion anchor not found')
text = text.replace(old, '', 1)
path.write_text(text, encoding='utf-8')
