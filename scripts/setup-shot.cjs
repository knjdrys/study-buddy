const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium').default;
(async () => {
  process.env.LD_LIBRARY_PATH = '/tmp/stublibs';
  const browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), args: chromium.args, headless: true });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, 600));
  await page.evaluate(async () => {
    const { store } = await import('/src/app/state.ts');
    const { buildSeedDB } = await import('/src/data/seed.ts');
    const seed = buildSeedDB();
    store.update((d) => { d.profile = { name: 'Maya', joinedAt: new Date().toISOString() }; d.subjects.push(...seed.subjects); d.topics.push(...seed.topics); d.concepts.push(...seed.concepts); });
    await store.replace(store.get());
    const { openExamSetup } = await import('/src/views/runners/exam.ts');
    openExamSetup(store.get().subjects[0].id, undefined, 'all', 'auto');
  });
  await new Promise((r) => setTimeout(r, 500));
  await page.screenshot({ path: '/home/user/shots/exam-setup.png' });
  console.log('shot exam-setup');
  await browser.close();
})().catch((e) => { console.log('FAIL', e.message.split('\n')[0]); process.exit(1); });
