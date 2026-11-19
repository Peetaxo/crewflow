import { Capacitor } from '@capacitor/core';
import { saveNativeDocument } from '../../../lib/native-document';

export async function saveEventHoursFile(file: File): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    await saveNativeDocument(file);
    return;
  }

  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  try {
    link.href = url;
    link.download = file.name;
    document.body.append(link);
    link.click();
  } finally {
    link.remove();
    // Browsers can consume the URL asynchronously after the click.
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}
