(function () {
  'use strict';

  const root = document.documentElement;
  root.dataset.preloaderStartedAt = String(performance.now());

  const navigation = performance.getEntriesByType('navigation')[0];
  const hasScrollRestoration = 'scrollRestoration' in window.history;
  if (navigation && navigation.type === 'back_forward') return;

  const originalScrollBehavior = root.style.scrollBehavior;
  root.style.scrollBehavior = 'auto';
  const resetRoot = !window.location.hash;
  if (resetRoot && hasScrollRestoration) window.history.scrollRestoration = 'manual';
  let pageShown = false;
  let siteReady = false;

  function placeInitialPosition() {
    if (window.location.hash) {
      let id = window.location.hash.slice(1);
      try { id = decodeURIComponent(id); } catch (_) { /* Use the raw fragment. */ }
      const target = document.getElementById(id);
      if (target) target.scrollIntoView({ behavior: 'instant', block: 'start' });
    } else {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    }
  }

  function finishInitialPosition() {
    if (!pageShown || !siteReady) return;
    placeInitialPosition();
    window.requestAnimationFrame(function () {
      window.requestAnimationFrame(function () {
        if (resetRoot && hasScrollRestoration) window.history.scrollRestoration = 'auto';
        root.style.scrollBehavior = originalScrollBehavior;
      });
    });
  }

  window.addEventListener('pageshow', function () {
    pageShown = true;
    placeInitialPosition();
    finishInitialPosition();
  }, { once: true });

  document.addEventListener('site:ready', function () {
    siteReady = true;
    finishInitialPosition();
  }, { once: true });
})();
