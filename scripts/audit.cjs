// Design audit: runs every route in headless chromium and measures
// overflow, contrast, tap targets, fonts, console errors.
const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium').default;

const routes = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const mobile = process.argv.includes('--mobile');
const W = mobile ? 390 : 1440;
const H = mobile ? 844 : 900;

function lum(rgb) {
  const [r, g, b] = rgb.map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a, b) {
  const l1 = lum(a), l2 = lum(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

(async () => {
  process.env.LD_LIBRARY_PATH = '/tmp/stublibs' + (process.env.LD_LIBRARY_PATH ? ':' + process.env.LD_LIBRARY_PATH : '');
  const browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), args: chromium.args, headless: true });
  const page = await browser.newPage();
  await page.setViewport({ width: W, height: H });

  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)); });
  page.on('pageerror', (e) => errors.push('PAGEERROR ' + String(e).slice(0, 160)));

  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle0' });
  await page.evaluate(async () => {
    const { store } = await import('/src/app/state.ts');
    const { buildSeedDB } = await import('/src/data/seed.ts');
    const { recordAttempt, recordSession } = await import('/src/app/actions.ts');
    const seed = buildSeedDB();
    store.update((d) => {
      d.profile = { name: 'Maya', joinedAt: new Date().toISOString() };
      d.subjects.push(...seed.subjects); d.topics.push(...seed.topics); d.concepts.push(...seed.concepts);
    });
    const concepts = store.get().concepts;
    for (let i = 0; i < concepts.length; i++) {
      const c = concepts[i]; const good = i % 3 !== 0;
      for (let d = 0; d < 4; d++) recordAttempt({ conceptId: c.id, mode: 'flashcard', outcome: good ? 'correct' : 'partial', confidence: 3, elapsedMs: 4000 });
      if (i % 3 === 0) recordAttempt({ conceptId: c.id, mode: 'flashcard', outcome: 'incorrect', confidence: 1, elapsedMs: 9000 });
    }
    recordSession({ subjectId: concepts[0].subjectId, minutesPlanned: 15, minutesActual: 12, segments: [{ kind: 'review', plannedMinutes: 6 }], attempts: [] });
    await store.replace(store.get());
  });

  const results = {};
  for (const route of routes) {
    const url = 'http://localhost:5173/' + (route === 'home' ? '#/home' : '#' + route);
    await page.goto(url, { waitUntil: 'networkidle0' });
    await new Promise((r) => setTimeout(r, 350));
    const audit = await page.evaluate(() => {
      const lum = (rgb) => { const [r, g, b] = rgb.map((c) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
      const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };
      const vw = document.documentElement.clientWidth;
      const out = { overflow: [], contrast: [], taptarget: [], zeroText: [], fonts: {}, bodyH: document.body.scrollHeight, docH: document.documentElement.scrollHeight };
      const all = [...document.querySelectorAll('body *')];
      // overflow
      for (const el of all) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (r.right > vw + 2 && getComputedStyle(el).position !== 'fixed') {
          if (out.overflow.length < 14) out.overflow.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 40)} right=${Math.round(r.right)} vw=${vw}`);
        }
      }
      // contrast + zero-text
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const seen = new Set();
      while (walker.nextNode()) {
        const n = walker.currentNode;
        const el = n.parentElement;
        if (!el || seen.has(el)) continue;
        seen.add(el);
        const text = n.textContent.trim();
        if (!text || text.length < 3) continue;
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden') continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) { out.zeroText.push(text.slice(0, 40)); continue; }
        if (cs.fontSize && parseFloat(cs.fontSize) < 9) continue;
        const parse = (c) => c.match(/[\d.]+/g)?.slice(0, 3).map(Number) ?? [0, 0, 0];
        let bg = cs.backgroundColor;
        let node = el;
        while ((bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent') && node.parentElement) {
          node = node.parentElement;
          bg = getComputedStyle(node).backgroundColor;
        }
        const cr = ratio(parse(cs.color), parse(bg));
        if (cr < 3.5 && parseFloat(cs.fontSize) <= 13.5) {
          if (out.contrast.length < 10) out.contrast.push(`${text.slice(0, 24)} fg=${cs.color} bg=${bg} ${cr.toFixed(2)}`);
        }
      }
      // tap targets
      for (const el of all) {
        const tag = el.tagName.toLowerCase();
        const interactive = tag === 'button' || tag === 'a' || tag === 'input' || tag === 'select' || tag === 'textarea' || el.getAttribute('role') === 'button';
        if (!interactive) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0) continue;
        if (r.width < 32 || r.height < 32) {
          if (out.taptarget.length < 10) out.taptarget.push(`${tag}.${String(el.className).slice(0, 30)} ${Math.round(r.width)}x${Math.round(r.height)}`);
        }
      }
      out.fonts = { fraunces: document.fonts.check('16px Fraunces'), inter: document.fonts.check('14px Inter') };
      return out;
    });
    results[route] = { ...audit, consoleErrors: errors.splice(0) };
  }
  console.log(JSON.stringify(results, null, 1));
  await browser.close();
})();
