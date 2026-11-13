/** Open a placeholder within the user's click gesture, then navigate after signing. */
export async function openSignedDocumentInNewTab(
  createSignedUrl: () => Promise<string>,
  openWindow: () => Window | null = () => window.open('about:blank', '_blank'),
): Promise<void> {
  // Opening only after an awaited Storage request is often blocked as a pop-up.
  const tab = openWindow();
  if (!tab) {
    throw new Error('O navegador bloqueou a nova aba. Permita pop-ups para abrir o documento.');
  }

  try {
    // A pre-opened tab must not retain access to the parent after navigation.
    tab.opener = null;
    const signedUrl = await createSignedUrl();
    if (!signedUrl?.trim()) throw new Error('Não foi possível obter o link do documento.');
    if (tab.closed) throw new Error('A aba foi fechada antes de abrir o documento.');
    tab.location.replace(signedUrl);
  } catch (error) {
    if (!tab.closed) tab.close();
    throw error;
  }
}
