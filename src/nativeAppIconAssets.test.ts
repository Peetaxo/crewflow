import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const readPngSize = (path: string) => {
  const file = readFileSync(resolve(process.cwd(), path));

  return {
    width: file.readUInt32BE(16),
    height: file.readUInt32BE(20),
  };
};

describe('native app icon assets', () => {
  it('generates iOS and Android launcher icons from the existing nodu mark', () => {
    const generator = readFileSync(resolve(process.cwd(), 'scripts/generate-app-icons.mjs'), 'utf8');
    const iosContents = readFileSync(
      resolve(process.cwd(), 'ios/App/App/Assets.xcassets/AppIcon.appiconset/Contents.json'),
      'utf8',
    );
    const androidBackground = readFileSync(
      resolve(process.cwd(), 'android/app/src/main/res/values/ic_launcher_background.xml'),
      'utf8',
    );

    expect(generator).toContain('public/nodu-mark.svg');
    expect(generator).toContain('AppIcon-512@2x.png');
    expect(generator).toContain('ic_launcher_foreground.png');
    expect(iosContents).toContain('"size" : "1024x1024"');
    expect(androidBackground).toContain('#FFFAF4');
    expect(readPngSize('ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png')).toEqual({
      width: 1024,
      height: 1024,
    });
    expect(readPngSize('android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png')).toEqual({
      width: 192,
      height: 192,
    });
    expect(readPngSize('android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.png')).toEqual({
      width: 432,
      height: 432,
    });
  });
});
