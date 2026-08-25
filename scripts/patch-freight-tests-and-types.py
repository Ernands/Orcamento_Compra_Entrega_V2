from pathlib import Path


def patch(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text(encoding='utf-8')
    if old not in text:
        raise SystemExit(f'pattern not found in {path}: {old[:100]!r}')
    file.write_text(text.replace(old, new), encoding='utf-8')


# Read models remain compatible with quote fixtures/data created before freight destinations existed.
patch(
    'src/domain/types.ts',
    '  capturedAt: string | null;\n  position: number;\n  destinations: SupplyQuoteItemDestination[];\n}',
    '  capturedAt: string | null;\n  position?: number;\n  destinations?: SupplyQuoteItemDestination[];\n}',
)

# SupplyQuotesPage tests: freight profiles are loaded by the existing supplies repository.
patch(
    'src/tests/supply-quotes-page.test.tsx',
    '  deleteSupplyQuote,\n  listSuppliers,\n',
    '  deleteSupplyQuote,\n  listSupplyFreightProfiles,\n  listSuppliers,\n',
)
patch(
    'src/tests/supply-quotes-page.test.tsx',
    "vi.mock('../data/supplies/supplies-repository', () => ({\n  deleteSupplyQuote: vi.fn(),\n",
    "vi.mock('../data/supplies/supplies-repository', () => ({\n  deleteSupplyQuote: vi.fn(),\n  listSupplyFreightProfiles: vi.fn(),\n",
)
patch(
    'src/tests/supply-quotes-page.test.tsx',
    '    vi.mocked(listStores).mockResolvedValue([store]);\n',
    '    vi.mocked(listStores).mockResolvedValue([store]);\n    vi.mocked(listSupplyFreightProfiles).mockResolvedValue([]);\n',
)

# Comparison-status test uses the same repository mock.
patch(
    'src/tests/supply-quotes-comparison-status.test.tsx',
    '  listSuppliers,\n  listSupplyItems,\n',
    '  listSupplyFreightProfiles,\n  listSuppliers,\n  listSupplyItems,\n',
)
patch(
    'src/tests/supply-quotes-comparison-status.test.tsx',
    "vi.mock('../data/supplies/supplies-repository', () => ({\n  deleteSupplyQuote: vi.fn(),\n",
    "vi.mock('../data/supplies/supplies-repository', () => ({\n  deleteSupplyQuote: vi.fn(),\n  listSupplyFreightProfiles: vi.fn(),\n",
)
patch(
    'src/tests/supply-quotes-comparison-status.test.tsx',
    '    vi.mocked(listStores).mockResolvedValue([]);\n',
    '    vi.mocked(listStores).mockResolvedValue([]);\n    vi.mocked(listSupplyFreightProfiles).mockResolvedValue([]);\n',
)
patch(
    'src/tests/supply-quotes-comparison-status.test.tsx',
    "vi.mock('../domain/supply-comparison', () => ({\n  getGroupedComparisonHighlights: vi.fn(() => ({\n    lowestUnitPriceIds: new Set<string>(),\n    lowestTotalIds: new Set<string>(),\n    shortestLeadTimeIds: new Set<string>(),\n  })),\n}));\n",
    "vi.mock('../domain/supply-comparison', () => ({\n  getGroupedComparisonHighlights: vi.fn(() => ({\n    lowestUnitPriceIds: new Set<string>(),\n    lowestTotalIds: new Set<string>(),\n    shortestLeadTimeIds: new Set<string>(),\n  })),\n  getGroupedQuoteComparisonHighlights: vi.fn(() => ({\n    lowestTotalQuoteIds: new Set<string>(),\n    shortestLeadTimeQuoteIds: new Set<string>(),\n    comparableQuoteIds: new Set<string>(),\n  })),\n  getQuoteDeliveryDays: vi.fn(() => null),\n}));\n",
)

print('freight tests and type compatibility patched')
