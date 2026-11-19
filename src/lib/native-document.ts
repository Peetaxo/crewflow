import { Capacitor, registerPlugin } from '@capacitor/core';

// Keep the existing bridge identifier for the native export plugin.
const pluginName = 'EventHoursFile';
const nativeFile = registerPlugin<{
  save(options: { filename: string; base64: string }): Promise<void>;
}>(pluginName);

export const canSaveNativeDocument = () => Capacitor.isPluginAvailable(pluginName);

export async function saveNativeDocument(file: File, isCurrent = () => true): Promise<void> {
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const dataUrl = reader.result as string;
      resolve(dataUrl.slice(dataUrl.indexOf(',') + 1));
    };
    reader.readAsDataURL(file);
  });
  if (isCurrent()) await nativeFile.save({ filename: file.name, base64 });
}
