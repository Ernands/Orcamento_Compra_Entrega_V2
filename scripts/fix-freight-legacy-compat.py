from pathlib import Path


def replace(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text(encoding='utf-8')
    if old not in text:
        raise SystemExit(f'pattern not found in {path}: {old[:80]!r}')
    file.write_text(text.replace(old, new), encoding='utf-8')


replace(
    'src/domain/supply-comparison.ts',
    '  if (item.destinations.length) {\n    return item.destinations\n',
    '  if ((item.destinations || []).length) {\n    return (item.destinations || [])\n',
)

replace(
    'src/pages/supply-comparison-page.tsx',
    '                ...item.destinations.map((destination) => destination.label),',
    '                ...(item.destinations || []).map((destination) => destination.label),',
)
replace(
    'src/pages/supply-comparison-page.tsx',
    '                  (sum, item) => sum + item.destinations.reduce((current, destination) => current + destination.destinationCount, 0),',
    '                  (sum, item) => sum + (item.destinations || []).reduce((current, destination) => current + destination.destinationCount, 0),',
)
replace(
    'src/pages/supply-comparison-page.tsx',
    '                    {item.destinations.length > 0 && (\n                      <small className="comparison-destinations-summary">\n                        {item.destinations.map((destination) => destination.label).join(\' · \')}\n',
    '                    {(item.destinations || []).length > 0 && (\n                      <small className="comparison-destinations-summary">\n                        {(item.destinations || []).map((destination) => destination.label).join(\' · \')}\n',
)

replace(
    'src/pages/supply-quotes-page.tsx',
    '      destinations: item.destinations.map(destinationValuesFromSaved),',
    '      destinations: (item.destinations || []).map(destinationValuesFromSaved),',
)
replace(
    'src/pages/supply-quotes-page.tsx',
    '                          {item.destinations.length > 0 && (',
    '                          {(item.destinations || []).length > 0 && (',
)
replace(
    'src/pages/supply-quotes-page.tsx',
    '                              {item.destinations.map((destination) => (',
    '                              {(item.destinations || []).map((destination) => (',
)

print('legacy freight compatibility applied')
