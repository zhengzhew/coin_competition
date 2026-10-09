import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { isFuture } from './theme';
const App = lazy(() => import('./App'));
const TeacherDashboard = lazy(() => import('./TeacherDashboard'));
const MapEditor = lazy(() => import('./MapEditor'));
const ThirdCompetitionApp = lazy(() => import('./third/ThirdCompetitionApp'));
const FarmApp = lazy(() => import('./farm/FarmApp'));
const BeachApp = lazy(() => import('./beach/BeachApp'));
const isBeach = /^\/beach(?:\/|$)/.test(window.location.pathname);
const isDemo = /^\/demo(?:\/|$)/.test(window.location.pathname);
const isFarm = /^\/farm(?:\/|$)/.test(window.location.pathname);

if (isFuture) document.documentElement.dataset.competition = 'future';
if (isDemo) document.documentElement.dataset.competition = 'third';
if (isFarm) document.documentElement.dataset.competition = 'farm';
if (isBeach) document.documentElement.dataset.competition = 'beach';

const Page = isBeach ? BeachApp : isFarm ? FarmApp : isDemo ? ThirdCompetitionApp : window.location.pathname.startsWith('/editor') ? MapEditor : window.location.pathname.startsWith('/teacher') ? TeacherDashboard : App;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Suspense fallback={<p>正在打开页面…</p>}><Page /></Suspense>
  </StrictMode>,
);
