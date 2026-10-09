export function downloadConfiguration(name: string, configuration: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(configuration, null, 2)], { type: 'application/json' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${name}.json`; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
