export type DetailTab = 'experience' | 'rules' | 'technology' | 'versions';
export const detailTabs: Record<DetailTab, string> = { experience: '体验', rules: '规则', technology: '技术方案', versions: '版本与复用' };
export const showcasePath = (id: string, tab: DetailTab = 'experience') => `/demo/showcase/${encodeURIComponent(id)}/${tab}/`;
export function parseHubRoute(path: string): { kind: 'home' | 'components' | 'detail' | 'invalid'; id?: string; tab?: DetailTab } {
  if (['/demo', '/demo/', '/demo/index.html'].includes(path)) return { kind: 'home' };
  if (/^\/demo\/components\/?$/.test(path)) return { kind: 'components' };
  const match = /^\/demo\/showcase\/([a-z0-9-]+)(?:\/(experience|rules|technology|versions))?\/?$/.exec(path);
  return match ? { kind: 'detail', id: match[1], tab: (match[2] || 'experience') as DetailTab } : { kind: 'invalid' };
}
