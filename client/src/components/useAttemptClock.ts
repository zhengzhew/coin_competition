import { useEffect, useRef, useState } from 'react';

export function useAttemptClock(id: string | undefined, running: boolean) {
  const clock = useRef({ id, elapsed: 0, since: 0 });
  const [, update] = useState(0);
  useEffect(() => {
    if (clock.current.id !== id) clock.current = { id, elapsed: 0, since: 0 };
    if (id && running) clock.current.since = performance.now();
    update(n => n + 1);
    const interval = window.setInterval(() => update(n => n + 1), 100);
    return () => {
      clearInterval(interval);
      if (clock.current.since) clock.current.elapsed += (performance.now() - clock.current.since) / 1000;
      clock.current.since = 0;
    };
  }, [id, running]);
  const seconds = () => clock.current.id !== id ? 0 : clock.current.elapsed + (clock.current.since ? (performance.now() - clock.current.since) / 1000 : 0);
  const freeze = () => { if (clock.current.since) { clock.current.elapsed += (performance.now() - clock.current.since) / 1000; clock.current.since = 0; } };
  return { elapsed: seconds(), seconds, freeze };
}
