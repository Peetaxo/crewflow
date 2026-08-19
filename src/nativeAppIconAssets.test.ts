import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

const readPngSize = (path: string) => {
  const file = readFileSync(resolve(process.cwd(), path));

  return {
    width: file.readUInt32BE(16),
    height: file.readUInt32BE(20),
  };
};

describe('native application shell', () => {
  it('uses a stable bundle identity without a committed live server URL', () => {
    const config = read('capacitor.config.ts');
    const liveSync = read('scripts/capacitor-live-sync.mjs');
    const iosProject = read('ios/App/App.xcodeproj/project.pbxproj');
    const androidBuild = read('android/app/build.gradle');
    const packageJson = JSON.parse(read('package.json')) as { dependencies: Record<string, string> };

    expect(config).toContain("appId: 'cz.nodu.app'");
    expect(config).toContain("appName: 'nodu'");
    expect(config).toContain("webDir: 'dist'");
    expect(config).not.toMatch(/server\s*:/);
    expect(config).not.toMatch(/\burl\s*:/);
    expect(liveSync).toContain('ios/App/App/capacitor.config.json');
    expect(liveSync).toContain('android/app/src/main/assets/capacitor.config.json');
    expect(liveSync).toContain('generatedConfig.server');
    expect(iosProject).toContain('PRODUCT_BUNDLE_IDENTIFIER = cz.nodu.app;');
    expect(androidBuild).toContain('applicationId "cz.nodu.app"');
    expect(packageJson.dependencies['@capacitor/cli']).toBe('8.4.2');
    expect(packageJson.dependencies['@capacitor/core']).toBe('8.4.2');
    expect(packageJson.dependencies['@capacitor/ios']).toBe('8.4.2');
    expect(packageJson.dependencies['@capacitor/android']).toBe('8.4.2');
  });

  it('generates iOS and Android launcher icons from the bundled nodu mark', () => {
    const generator = read('scripts/generate-app-icons.mjs');
    const iosContents = read('ios/App/App/Assets.xcassets/AppIcon.appiconset/Contents.json');
    const androidBackground = read('android/app/src/main/res/values/ic_launcher_background.xml');

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
