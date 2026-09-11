// End-to-end smoke: seed → exam setup → adaptive MC paper → answer through.
const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium').default;

(async () => {
  process.env.LD_LIBRARY_PATH = '/tmp/stublibs';
  const browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), args: chromium.args, headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('PAGEERROR ' + String(e).slice(0, 140)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 140)); });

  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, 600));

  // seed + some wrong history so adaptation kicks in
  await page.evaluate(async () => {
    const { store } = await import('/src/app/state.ts');
    const { buildSeedDB } = await import('/src/data/seed.ts');
    const { recordAttempt } = await import('/src/app/actions.ts');
    const seed = buildSeedDB();
    store.update((d) => {
      d.profile = { name: 'Maya', joinedAt: new Date().toISOString() };
      d.subjects.push(...seed.subjects); d.topics.push(...seed.topics); d.concepts.push(...seed.concepts);
    });
    const concepts = store.get().concepts;
    for (let i = 0; i < concepts.length; i++) {
      const c = concepts[i];
      recordAttempt({ conceptId: c.id, mode: 'mc', outcome: i % 4 === 0 ? 'incorrect' : 'correct', confidence: i % 4 === 0 ? 1 : 3, elapsedMs: 5000 });
    }
    await store.replace(store.get());
  });

  // open the exam setup with mode mc
  const setup = await page.evaluate(async () => {
    const { store } = await import('/src/app/state.ts');
    const { openExamSetup } = await import('/src/views/runners/exam.ts');
    openExamSetup(store.get().subjects[0].id, undefined, 'all', 'mc');
    return true;
  });
  console.log('setup opened:', setup);
  await new Promise((r) => setTimeout(r, 400));
  console.log('mode chips:', await page.evaluate(() => document.querySelectorAll('.mode-chip').length));
  console.log('auto chip on:', await page.evaluate(() => document.querySelector('.mode-chip.on')?.textContent));

  // choose Multiple choice, begin
  await page.evaluate(() => {
    const chips = [...document.querySelectorAll('.mode-chip')];
    chips.find((c) => c.textContent.includes('Multiple choice'))?.click();
  });
  await new Promise((r) => setTimeout(r, 200));
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('.dialog-actions .btn-primary')];
    btns[btns.length - 1]?.click();
  });
  await new Promise((r) => setTimeout(r, 500));

  console.log('overlay open:', await page.evaluate(() => !!document.querySelector('.runner-overlay')));
  console.log('header:', await page.evaluate(() => document.querySelector('.runner-overlay .page-kicker')?.textContent));

  // answer through up to 6 questions: read options, click first, then confidence
  for (let i = 0; i < 6; i++) {
    const state = await page.evaluate(() => {
      const opts = [...document.querySelectorAll('.runner-overlay .opt')].map((o) => o.textContent?.slice(0, 60));
      const prompt = document.querySelector('.runner-overlay p')?.textContent?.slice(0, 80);
      return { opts, prompt, done: !!document.querySelector('.runner-overlay .center') };
    });
    if (state.done || !state.opts.length) { console.log('reached end state at question', i); break; }
    console.log(`Q${i + 1}:`, state.prompt, '| options:', state.opts.length, '| first:', state.opts[0]);
    await page.evaluate(() => {
      const el = document.querySelector('.runner-overlay .opt');
      el?.click();
    });
    await new Promise((r) => setTimeout(r, 550));
    const hasConfidence = await page.evaluate(() => [...document.querySelectorAll('.runner-overlay .btn')].some((b) => b.textContent === 'Guessed'));
    if (hasConfidence) {
      await page.evaluate(() => {
        const b = [...document.querySelectorAll('.runner-overlay .btn')].find((x) => x.textContent === 'Certain');
        b?.click();
      });
    }
    await new Promise((r) => setTimeout(r, 300));
  }

  console.log('console errors:', errors.length ? errors : 'none');
  await page.screenshot({ path: '/home/user/shots/exam-brain.png' });
  await browser.close();
})().catch((e) => { console.log('FAIL', e.message.split('\n')[0]); process.exit(1); });
