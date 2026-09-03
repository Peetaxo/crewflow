import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

const readPlistArray = (plist: string, key: string) => {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const contents = plist.match(
    new RegExp(`<key>${escapedKey}</key>\\s*<array>([\\s\\S]*?)</array>`),
  )?.[1];

  if (!contents) {
    throw new Error(`Missing plist array: ${key}`);
  }

  return Array.from(contents.matchAll(/<string>([^<]+)<\/string>/g), (match) => match[1]);
};

const readMainActivity = (manifest: string) => {
  const activity = manifest.match(
    /<activity\b(?=[^>]*android:name="\.MainActivity")[\s\S]*?<\/activity>/,
  )?.[0];

  if (!activity) {
    throw new Error('Missing Android MainActivity declaration');
  }

  return activity;
};

describe('native portrait orientation lock', () => {
  it('supports only upright portrait on iPhone and iPad', () => {
    const plist = read('ios/App/App/Info.plist');

    expect(readPlistArray(plist, 'UISupportedInterfaceOrientations')).toEqual([
      'UIInterfaceOrientationPortrait',
    ]);
    expect(readPlistArray(plist, 'UISupportedInterfaceOrientations~ipad')).toEqual([
      'UIInterfaceOrientationPortrait',
    ]);
  });

  it('requests portrait orientation for the Android MainActivity', () => {
    const activity = readMainActivity(read('android/app/src/main/AndroidManifest.xml'));

    expect(activity).toContain('android:screenOrientation="portrait"');
  });

  it('keeps the Android 16 large-screen portrait compatibility opt-out valid', () => {
    const activity = readMainActivity(read('android/app/src/main/AndroidManifest.xml'));
    const variables = read('android/variables.gradle');

    expect(variables).toMatch(/targetSdkVersion\s*=\s*36\b/);
    expect(activity).toContain(
      'android:name="android.window.PROPERTY_COMPAT_ALLOW_RESTRICTED_RESIZABILITY"',
    );
    expect(activity).toMatch(
      /android:name="android\.window\.PROPERTY_COMPAT_ALLOW_RESTRICTED_RESIZABILITY"\s+android:value="true"/,
    );
  });
});
