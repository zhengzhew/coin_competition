import { useEffect, useRef, useState } from 'react';

export default function AttemptTimer({ attemptId, running }: { attemptId?: string; running: boolean }) {
  const [elapsed, setElapsed] = useState(0);
  const clock = useRef<{ id?: string; elapsed: number }>({ elapsed: 0 });

  useEffect(() => {
    if (clock.current.id !== attemptId) clock.current = { id: attemptId, elapsed: 0 };
    setElapsed(clock.current.elapsed);
    if (!attemptId || !running) return;
    const started = performance.now();
    const previous = clock.current.elapsed;
    const update = () => setElapsed(previous + (performance.now() - started) / 1000);
    const interval = window.setInterval(update, 100);
    return () => {
      window.clearInterval(interval);
      clock.current.elapsed = previous + (performance.now() - started) / 1000;
    };
  }, [attemptId, running]);

  return <div className="competition-timer" aria-label="本轮用时"><span>本轮用时</span><output data-testid="competition-timer">{elapsed.toFixed(1)}<small> 秒</small></output></div>;
}
