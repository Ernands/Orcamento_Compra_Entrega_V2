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

for path in [
    'src/tests/supply-quotes-page.test.tsx',
    'src/tests/supply-quotes-comparison-status.test.tsx',
]:
    patch(
        path,
        "import { listStores } from '../data/stores/stores-repository';\n" if path.endswith('supply-quotes-page.test.tsx') else "import {\n  listStores,\n} from '../data/stores/stores-repository';\n",
        ("import { listStores } from '../data/stores/stores-repository';\n" if path.endswith('supply-quotes-page.test.tsx') else "import {\n  listStores,\n} from '../data/stores/stores-repository';\n")
        + "import { listSupplyFreightProfiles } from '../data/supplies/freight-destinations-repository';\n",
    )
    patch(
        path,
        "vi.mock('../data/stores/stores-repository', () => ({ listStores: vi.fn() }));\n",
        "vi.mock('../data/stores/stores-repository', () => ({ listStores: vi.fn() }));\nvi.mock('../data/supplies/freight-destinations-repository', () => ({\n  listSupplyFreightProfiles: vi.fn(),\n}));\n",
    )
    patch(
        path,
        "    vi.mocked(listStores).mockResolvedValue([store]);\n" if path.endswith('supply-quotes-page.test.tsx') else "    vi.mocked(listStores).mockResolvedValue([]);\n",
        ("    vi.mocked(listStores).mockResolvedValue([store]);\n" if path.endswith('supply-quotes-page.test.tsx') else "    vi.mocked(listStores).mockResolvedValue([]);\n")
        + "    vi.mocked(listSupplyFreightProfiles).mockResolvedValue([]);\n",
    )

print('freight tests and type compatibility patched')
