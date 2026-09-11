// Screenshot helper: drives headless chromium (from npm) against the dev server.
const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium').default;

const shots = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const dark = process.argv.includes('--dark');
const BASE = process.env.BASE || 'http://localhost:5173';

(async () => {
  process.env.LD_LIBRARY_PATH = '/tmp/stublibs' + (process.env.LD_LIBRARY_PATH ? ':' + process.env.LD_LIBRARY_PATH : '');
  const browser = await puppeteer.launch({
    executablePath: await chromium.executablePath(),
    args: chromium.args,
    headless: true,
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });

  const mk = (name, url) => shots.includes(name) || shots.includes('all')
    ? page.goto(BASE + url, { waitUntil: 'networkidle0' }).then(async () => {
        await new Promise((r) => setTimeout(r, 400));
        await page.screenshot({ path: `/home/user/shots/${name}${dark ? '-dark' : ''}.png`, fullPage: false });
        console.log('shot', name);
      }).catch((e) => console.log('FAIL', name, e.message))
    : null;

  // Fresh state → onboarding
  await page.goto(BASE + '/', { waitUntil: 'networkidle0' });
  await mk('onboarding', '/#/onboarding');
  await new Promise((r) => setTimeout(r, 500));
  // Seed a rich library + some history so the app has real data to show
  await page.evaluate(async (darkMode) => {
    const { store } = await import('/src/app/state.ts');
    const { buildSeedDB } = await import('/src/data/seed.ts');
    const { recordAttempt } = await import('/src/app/actions.ts');
    const { recordSession } = await import('/src/app/actions.ts');
    const seed = buildSeedDB();
    store.update((d) => {
      d.profile = { name: 'Maya', joinedAt: new Date().toISOString() };
      d.settings.theme = darkMode;
      d.subjects.push(...seed.subjects);
      d.topics.push(...seed.topics);
      d.concepts.push(...seed.concepts);
    });
    const { applyTheme } = await import('/src/views/shell.ts');
    applyTheme(darkMode);
    // simulate some studying history
    const concepts = store.get().concepts;
    const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();
    for (let i = 0; i < concepts.length; i++) {
      const c = concepts[i];
      const good = i % 3 !== 0;
      for (let d = 0; d < 4; d++) {
        recordAttempt({ conceptId: c.id, mode: 'flashcard', outcome: good ? 'correct' : (d === 3 ? 'incorrect' : 'partial'), confidence: good ? 3 : 1, elapsedMs: 5000 + i * 700 });
      }
      if (i === 0) recordAttempt({ conceptId: c.id, mode: 'flashcard', outcome: 'incorrect', confidence: 1, elapsedMs: 9000 });
    }
    recordSession({ subjectId: concepts[0].subjectId, minutesPlanned: 15, minutesActual: 12, segments: [{ kind: 'review', plannedMinutes: 6 }], attempts: [] });
    await store.replace(store.get());
  }, dark ? 'dark' : 'light');

  await mk('home', '/#/home');
  await mk('learn', '/#/learn');
  await mk('review', '/#/review');
  await mk('practice', '/#/practice');
  await mk('progress', '/#/progress');
  await mk('plan', '/#/plan');
  await mk('library', '/#/library');
  await mk('tutor', '/#/tutor');
  await mk('settings', '/#/settings');

  // detail routes need a real id — take the first concept/subject from the store
  const ids = await page.evaluate(async () => {
    const { store } = await import('/src/app/state.ts');
    const db = store.get();
    return { concept: db.concepts[0]?.id, subject: db.subjects[0]?.id };
  });
  if (ids.concept) await mk('concept', '/#/concept/' + ids.concept);
  if (ids.subject) await mk('subject', '/#/subject/' + ids.subject);
  await browser.close();
})();
