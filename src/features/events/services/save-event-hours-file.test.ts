import { afterEach, describe, expect, it, vi } from 'vitest';
import { saveEventHoursFile } from './save-event-hours-file';

const { isNativePlatform, save } = vi.hoisted(() => ({
  isNativePlatform: vi.fn(),
  save: vi.fn(),
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform },
  registerPlugin: (name: string) => name === 'EventHoursFile' ? { save } : undefined,
}));

const type = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const file = new File([new Uint8Array([0x50, 0x4b, 0xff])], 'Říjen 2026.xlsx', { type });

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

describe('saveEventHoursFile', () => {
  it('downloads the original browser file under its generated name and releases the URL afterwards', async () => {
    vi.useFakeTimers();
    isNativePlatform.mockReturnValue(false);
    const createObjectURL = vi.fn(() => 'blob:https://example.test/workbook');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.href).toBe('blob:https://example.test/workbook');
      expect(this.download).toBe(file.name);
      expect(this.isConnected).toBe(true);
    });

    await saveEventHoursFile(file);

    expect(createObjectURL).toHaveBeenCalledWith(file);
    expect(click).toHaveBeenCalledOnce();
    expect(document.querySelector('a[download]')).toBeNull();
    expect(revokeObjectURL).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:https://example.test/workbook');
  });

  it('passes the exact workbook bytes and original name to the native document picker', async () => {
    isNativePlatform.mockReturnValue(true);
    await saveEventHoursFile(file);
    expect(save).toHaveBeenCalledWith({ filename: file.name, base64: 'UEv/' });
  });

  it('lets the native picker close without an error when the user cancels', async () => {
    isNativePlatform.mockReturnValue(true);
    let dismissPicker: () => void;
    save.mockImplementation(() => new Promise<void>(resolve => { dismissPicker = resolve; }));
    const onFinished = vi.fn();
    const saving = saveEventHoursFile(file).then(onFinished);
    await vi.waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(onFinished).not.toHaveBeenCalled();
    dismissPicker();
    await saving;
    expect(onFinished).toHaveBeenCalledWith(undefined);
  });

  it('reports native write failures to the caller', async () => {
    isNativePlatform.mockReturnValue(true);
    const error = new Error('Disk full');
    save.mockRejectedValue(error);
    await expect(saveEventHoursFile(file)).rejects.toBe(error);
  });
});
