(function () {
  'use strict';

  const root = document.documentElement;
  root.dataset.preloaderStartedAt = String(performance.now());

  const navigation = performance.getEntriesByType('navigation')[0];
  const hasScrollRestoration = 'scrollRestoration' in window.history;
  if (!navigation || navigation.type !== 'navigate' || window.location.hash || !hasScrollRestoration) {
    return;
  }

  window.history.scrollRestoration = 'manual';
  window.addEventListener('pageshow', function () {
    if (!window.location.hash) window.scrollTo(0, 0);
    window.requestAnimationFrame(function () {
      window.history.scrollRestoration = 'auto';
    });
  }, { once: true });
})();
