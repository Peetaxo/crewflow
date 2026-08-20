import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceMarkPath = path.join(rootDir, 'public/nodu-mark.svg');
const iosIconPath = path.join(rootDir, 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png');
const noduBackground = '#FFFAF4';
const systemChromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const androidIconSizes = [
  ['mipmap-mdpi', 48],
  ['mipmap-hdpi', 72],
  ['mipmap-xhdpi', 96],
  ['mipmap-xxhdpi', 144],
  ['mipmap-xxxhdpi', 192],
];

const androidForegroundSizes = [
  ['mipmap-mdpi', 108],
  ['mipmap-hdpi', 162],
  ['mipmap-xhdpi', 216],
  ['mipmap-xxhdpi', 324],
  ['mipmap-xxxhdpi', 432],
];

const buildIconHtml = ({
  markSvg,
  size,
  transparent = false,
  rounded = false,
  markScale = 0.74,
}) => `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      html,
      body {
        width: ${size}px;
        height: ${size}px;
        margin: 0;
        overflow: hidden;
        background: ${transparent ? 'transparent' : noduBackground};
      }

      .icon {
        display: flex;
        width: ${size}px;
        height: ${size}px;
        align-items: center;
        justify-content: center;
        overflow: hidden;
        background:
          radial-gradient(circle at 28% 22%, rgb(255 255 255 / 0.82), transparent 33%),
          ${noduBackground};
      }

      .icon--transparent {
        background: transparent;
      }

      .icon--rounded {
        border-radius: 50%;
      }

      .nodu-mark {
        width: ${Math.round(markScale * 100)}%;
        height: ${Math.round(markScale * 100)}%;
        overflow: visible;
      }

      .nodu-mark path[stroke="black"] {
        stroke: #2F261F;
      }
    </style>
  </head>
  <body>
    <div class="icon ${transparent ? 'icon--transparent' : ''} ${rounded ? 'icon--rounded' : ''}">
      ${markSvg.replace('<svg ', '<svg class="nodu-mark" ')}
    </div>
  </body>
</html>
`;

const renderIcon = async (page, markSvg, outputPath, size, options = {}) => {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(buildIconHtml({ markSvg, size, ...options }));
  await writeFile(outputPath, await page.screenshot({
    type: 'png',
    omitBackground: Boolean(options.transparent),
  }));
};

const markSvg = await readFile(sourceMarkPath, 'utf8');
let browser;

try {
  browser = await chromium.launch({ headless: true });
} catch (error) {
  await access(systemChromePath);
  browser = await chromium.launch({
    executablePath: systemChromePath,
    headless: true,
  });
}

const page = await browser.newPage({ deviceScaleFactor: 1 });

await renderIcon(page, markSvg, iosIconPath, 1024, { markScale: 0.72 });

for (const [density, size] of androidIconSizes) {
  await renderIcon(
    page,
    markSvg,
    path.join(rootDir, `android/app/src/main/res/${density}/ic_launcher.png`),
    size,
    { markScale: 0.72 },
  );
  await renderIcon(
    page,
    markSvg,
    path.join(rootDir, `android/app/src/main/res/${density}/ic_launcher_round.png`),
    size,
    { markScale: 0.72, rounded: true },
  );
}

for (const [density, size] of androidForegroundSizes) {
  await renderIcon(
    page,
    markSvg,
    path.join(rootDir, `android/app/src/main/res/${density}/ic_launcher_foreground.png`),
    size,
    { markScale: 0.62, transparent: true },
  );
}

await browser.close();
