process.env.LD_LIBRARY_PATH = '/tmp/stublibs';
const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium').default;
(async () => {
  const browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), args: chromium.args, headless: true });
  const page = await browser.newPage();
  await page.setViewport({ width: 1480, height: 640 });
  await page.goto('file:///home/user/study-buddy/scripts/palette-preview.html', { waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, 300));
  await page.screenshot({ path: '/home/user/shots/palette-options.png' });
  console.log('saved palette-options.png');
  await browser.close();
})();
