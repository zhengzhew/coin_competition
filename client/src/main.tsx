import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import TeacherDashboard from './TeacherDashboard.tsx';
import { isFuture } from './theme';

if (isFuture) document.documentElement.dataset.competition = 'future';

const Page = window.location.pathname.startsWith('/teacher') ? TeacherDashboard : App;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Page />
  </StrictMode>,
);
