from pathlib import Path
import re

path = Path('src/tests/supply-purchases-page.test.tsx')
text = path.read_text(encoding='utf-8')
pattern = re.compile(r"  it\('mostra item, quantidades e link do produto com a compra recolhida', async \(\) => \{.*?\n  \}\);\n", re.S)
replacement = """  it('mantem a compra recolhida compacta e mostra os itens sob demanda', async () => {
    const user = userEvent.setup();
    renderPage({
      ...purchase,
      items: [{ ...baseItem, productUrl: 'https://example.com/cadeira' }],
    });

    await screen.findByText('CMP-00001');
    expect(screen.queryByText('Cadeira operacional')).not.toBeInTheDocument();

    const collapsedItems = screen.getByLabelText('Resumo dos itens da compra CMP-00001');
    expect(within(collapsedItems).getByText('1 itens · 10 un')).toBeInTheDocument();

    await user.click(within(collapsedItems).getByRole('button', { name: 'Ver itens (1)' }));
    expect(within(collapsedItems).getByText('Cadeira operacional')).toBeInTheDocument();
    expect(within(collapsedItems).getByRole('link', { name: 'Ver produto' })).toHaveAttribute('href', 'https://example.com/cadeira');
  });
"""
new_text, count = pattern.subn(replacement, text, count=1)
if count != 1:
    raise SystemExit(f'expected one compact purchase test, found {count}')
path.write_text(new_text, encoding='utf-8')
