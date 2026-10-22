/** Translate obsolete, lazy-loaded export assets into actionable recovery guidance. */
const OUTDATED_EXPORT_MODULE =
  'Não foi possível carregar o módulo de exportação. Uma versão mais recente do Implanta 27 pode ter sido publicada enquanto esta aba estava aberta. Salve qualquer formulário em edição, pressione Ctrl + Shift + R e tente exportar novamente. Se continuar, feche as abas do sistema e abra-o outra vez.';

const MISSING_IMPORT_PATTERNS = [
  'failed to fetch dynamically imported module',
  'error loading dynamically imported module',
  'importing a module script failed',
  'failed to load module script',
  'chunkloaderror',
  'loading chunk',
];

export function exportErrorMessage(error: unknown, fallback: string): string {
  const raw = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  const normalized = raw.toLowerCase();

  if (MISSING_IMPORT_PATTERNS.some((pattern) => normalized.includes(pattern))) {
    return OUTDATED_EXPORT_MODULE;
  }
  return raw || fallback;
}
