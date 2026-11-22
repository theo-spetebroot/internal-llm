// Keep in sync with src/theme/theme.ts (storage key and values).
(function () {
  var preference = 'system';
  try {
    var stored = window.localStorage.getItem('internal-llm:theme');
    if (stored === 'light' || stored === 'dark') preference = stored;
  } catch {
    // Storage unavailable (private mode, blocked): follow the system.
  }
  var dark =
    preference === 'dark' ||
    (preference === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
})();
