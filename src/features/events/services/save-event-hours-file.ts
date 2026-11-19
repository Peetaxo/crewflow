import { Capacitor, registerPlugin } from '@capacitor/core';

const nativeFile = registerPlugin<{
  save(options: { filename: string; base64: string }): Promise<void>;
}>('EventHoursFile');

function readBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const dataUrl = reader.result as string;
      resolve(dataUrl.slice(dataUrl.indexOf(',') + 1));
    };
    reader.readAsDataURL(file);
  });
}

export async function saveEventHoursFile(file: File): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    await nativeFile.save({ filename: file.name, base64: await readBase64(file) });
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
