import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { isFuture } from './theme';
const App = lazy(() => import('./App'));
const TeacherDashboard = lazy(() => import('./TeacherDashboard'));

const ThirdCompetitionApp = lazy(() => import('./third/ThirdCompetitionApp'));
const isThird = /^\/third(?:\/|$)/.test(window.location.pathname);

if (isFuture) document.documentElement.dataset.competition = 'future';
if (isThird) document.documentElement.dataset.competition = 'third';

const Page = isThird ? ThirdCompetitionApp : window.location.pathname.startsWith('/teacher') ? TeacherDashboard : App;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Suspense fallback={<p>正在打开页面…</p>}><Page /></Suspense>
  </StrictMode>,
);
