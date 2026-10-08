import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { isFuture } from './theme';
const App = lazy(() => import('./App'));
const TeacherDashboard = lazy(() => import('./TeacherDashboard'));

const ThirdCompetitionApp = lazy(() => import('./third/ThirdCompetitionApp'));
// Keep old bookmarks and browser drafts usable when moving the public entry.
if (/^\/third(?:\/|$)/.test(window.location.pathname)) {
  const path = window.location.pathname.replace(/^\/third/, '/demo').replace(/\/index\.html$/, '/');
  window.history.replaceState(null, '', `${path === '/demo' ? '/demo/' : path}${window.location.search}${window.location.hash}`);
}
const isDemo = /^\/demo(?:\/|$)/.test(window.location.pathname);

if (isFuture) document.documentElement.dataset.competition = 'future';
if (isDemo) document.documentElement.dataset.competition = 'third';

const Page = isDemo ? ThirdCompetitionApp : window.location.pathname.startsWith('/teacher') ? TeacherDashboard : App;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Suspense fallback={<p>正在打开页面…</p>}><Page /></Suspense>
  </StrictMode>,
);
