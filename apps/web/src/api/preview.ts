export async function fetchExtensionDownload(): Promise<Blob> {
  const response = await fetch('/api/preview/extension-download', {
    cache: 'no-store',
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error || 'Failed to download the extension package.');
  }

  return response.blob();
}

export async function fetchExtensionVersion(): Promise<string> {
  const response = await fetch('/api/preview/extension-version', {
    cache: 'no-store',
  });
  const data = (await response.json()) as { version?: string };
  return data.version ?? '0.0.0';
}
