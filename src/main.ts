import './style.css';
import { store } from './app/state';
import { currentRoute, onRoute, type RouteName } from './app/router';
import { renderShell, applyTheme, refreshThemeIcons } from './views/shell';
import { ctx } from './app/ctx';
import { mount } from './lib/h';
import { buildSeedDB } from './data/seed';
import { toast } from './app/ui';

import { viewOnboarding } from './views/onboarding';
import { viewHome } from './views/home';
import { viewLearn, viewSubject, viewConcept } from './views/learn';
import { viewPractice } from './views/practice';
import { viewReview } from './views/review';
import { viewProgress } from './views/progress';
import { viewPlan } from './views/plan';
import { viewLibrary } from './views/library';
import { viewTutor } from './views/tutor';
import { viewSettings } from './views/settings';

type ViewFn = (c: ReturnType<typeof ctx>) => Node[];

const VIEWS: Partial<Record<RouteName, ViewFn>> = {
  onboarding: viewOnboarding,
  home: viewHome,
  learn: viewLearn,
  subject: viewSubject,
  concept: viewConcept,
  practice: viewPractice,
  review: viewReview,
  progress: viewProgress,
  plan: viewPlan,
  library: viewLibrary,
  tutor: viewTutor,
  settings: viewSettings,
};

async function boot(): Promise<void> {
  await store.init();
  const db = store.get();

  applyTheme(db.settings.theme);
  refreshThemeIcons();

  // First run → onboarding. (A library that's empty on purpose routes home.)
  if (!db.profile && db.subjects.length === 0 && !window.location.hash.includes('onboarding')) {
    window.location.hash = '#/onboarding';
  }

  const { content } = renderShell();

  const render = () => {
    const route = currentRoute();
    const view = VIEWS[route.name as RouteName] ?? viewHome;
    const nodes = view(ctx(store.get(), (name, params) => {
      window.location.hash = `#/${name}${params && Object.keys(params).length ? '/' + Object.entries(params).map(([k, v]) => `${k}/${encodeURIComponent(v)}`).join('/') : ''}`;
    }));
    mount(content, nodes);
    content.classList.remove('view-enter');
    void content.offsetWidth; // restart animation
    content.classList.add('view-enter');
  };

  onRoute(render);
  store.subscribe(() => {
    // Re-render only when a view is mounted (overlays manage themselves).
    if (!document.querySelector('.runner-overlay')) render();
  });
  render();

  if (db.subjects.length === 0 && db.profile) {
    // Post-onboarding: nothing created yet → offer the sample library once.
    offerSeedLibrary();
  }
}

/** One quiet, skippable offer of the sample library — zero-to-value fast. */
function offerSeedLibrary(): void {
  const dismissed = localStorage.getItem('studybuddy.seed.offered');
  if (dismissed) return;
  localStorage.setItem('studybuddy.seed.offered', '1');
  const db = store.get();
  if (db.subjects.length > 0) return;
  toast('Want a ready-made starter library? Biology, CS and Economics with real content.', {
    keep: true,
    duration: 12000,
    action: {
      label: 'Add samples',
      run: () => {
        store.update((d) => {
          const seed = buildSeedDB();
          d.subjects.push(...seed.subjects);
          d.topics.push(...seed.topics);
          d.concepts.push(...seed.concepts);
        });
        toast('Sample library added. Head to Learn and pick a subject.');
      },
    },
  });
}

void boot();
