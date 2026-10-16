import type { ReactNode } from 'react';
import './MapStatus.css';

export default function MapStatus({ position, heading, cargo, children }: { position?: ReactNode; heading?: ReactNode; cargo?: string; children?: ReactNode }) {
  return <div className="map-status" aria-label="小车状态">
    <div className="map-position">{position && <><small>位置</small><b>{position}</b></>}{heading && <span className="map-heading">{heading}</span>}</div>
    {cargo && <span className="map-cargo">{cargo}</span>}
    {children && <details className="map-help"><summary>操作说明 <b aria-hidden="true">?</b></summary><div>{children}</div></details>}
  </div>;
}
