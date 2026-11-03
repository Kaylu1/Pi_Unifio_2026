/* Aplica o tema antes de pintar a página. Arquivo local, sem chamadas de rede. */
(() => {
  let saved;
  try { saved = localStorage.getItem('oscar.theme'); } catch (_) { /* Usa a preferência do sistema. */ }
  const theme = saved === 'light' || saved === 'dark' ? saved : matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#111115' : '#f5f5f7');
})();