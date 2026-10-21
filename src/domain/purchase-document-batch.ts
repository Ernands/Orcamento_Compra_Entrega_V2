/**
 * Uploads each selected attachment independently, preserving successful uploads
 * if a later one fails. File-level retries must only resend `failed`.
 */
export async function uploadPurchaseDocumentsBatch<T>(
  files: readonly T[],
  uploadFile: (file: T) => Promise<void>,
  onProgress?: (processed: number, total: number) => void,
): Promise<{ uploaded: T[]; failed: Array<{ file: T; reason: string }> }> {
  const uploaded: T[] = [];
  const failed: Array<{ file: T; reason: string }> = [];

  for (const file of files) {
    try {
      await uploadFile(file);
      uploaded.push(file);
    } catch (failure) {
      failed.push({
        file,
        reason: failure instanceof Error && failure.message
          ? failure.message
          : 'Nao foi possivel enviar o documento.',
      });
    }
    onProgress?.(uploaded.length + failed.length, files.length);
  }

  return { uploaded, failed };
}
