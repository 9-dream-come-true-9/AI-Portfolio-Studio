(function () {
  'use strict';

  // Independent recovery path for a failed, blocked, or late preloader.js.
  // This runs from the main document script and prevents a loading overlay from
  // becoming a permanent interaction lock.
  function releaseStalledPreloader() {
    const root = document.documentElement;
    const loader = document.getElementById('site-preloader');
    if (!root.classList.contains('preloading') && (!loader || loader.hidden)) return;

    window.__sitePreloaderEmergencyRelease = true;
    root.classList.remove('preloading');
    root.classList.add('site-ready');

    if (loader) {
      loader.classList.add('is-ready');
      loader.hidden = true;
    }

    if (document.body) {
      document.body.removeAttribute('aria-busy');
      Array.from(document.body.children).forEach(function (element) {
        if (element === loader || element.tagName === 'SCRIPT') return;
        element.removeAttribute('inert');
        if (element.dataset.preloaderAriaHidden === 'true') {
          element.removeAttribute('aria-hidden');
          delete element.dataset.preloaderAriaHidden;
        }
      });
    }

    document.dispatchEvent(new CustomEvent('site:ready', {
      detail: { forced: true, reason: 'preloader-timeout' }
    }));
  }

  // Keep the emergency path after the normal five-second hand-off. This must
  // not release a healthy preloader early and leave its progress bar unfinished.
  window.__sitePreloaderFallbackTimer = window.setTimeout(releaseStalledPreloader, 6500);

  function whenSiteReady(callback) {
    if (
      document.documentElement.classList.contains('site-ready') ||
      !document.getElementById('site-preloader')
    ) {
      callback();
      return;
    }

    document.addEventListener('site:ready', callback, { once: true });
  }

  function initHeroCopySequence() {
    const heroCopySteps = document.querySelectorAll('.hero-copy-step, .hero-summary-step');
    if (!heroCopySteps.length) return;

    const showHeroCopy = function () {
      heroCopySteps.forEach(function (el) {
        el.classList.add('is-visible');
      });
    };

    if (typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(function () {
        window.requestAnimationFrame(showHeroCopy);
      });
    } else {
      window.setTimeout(showHeroCopy, 16);
    }

    window.setTimeout(function () {
      document.documentElement.classList.add('hero-motion-done');
    }, 3300);
  }

  function initFloatingNavigation() {
    const primaryNav = document.querySelector('.site-header .nav-links');
    const siteHeader = document.querySelector('.site-header');
    if (!primaryNav || !siteHeader || document.querySelector('[data-floating-nav]')) return;

    const floatingNav = primaryNav.cloneNode(true);
    floatingNav.className = 'floating-nav';
    floatingNav.setAttribute('data-floating-nav', '');
    floatingNav.setAttribute('aria-label', '滚动快捷导航');
    floatingNav.setAttribute('aria-hidden', 'true');
    floatingNav.setAttribute('inert', '');
    siteHeader.insertAdjacentElement('afterend', floatingNav);

    let isVisible = false;

    function transferFocusedLink(fromNav, toNav) {
      const activeElement = document.activeElement;
      if (!activeElement || !fromNav.contains(activeElement)) return;

      const href = activeElement.getAttribute('href');
      if (!href) return;

      const matchingLink = Array.from(toNav.querySelectorAll('a[href]')).find(function (link) {
        return link.getAttribute('href') === href;
      });

      if (matchingLink) matchingLink.focus({ preventScroll: true });
    }

    function setFloatingNavVisible(shouldShow) {
      const stateChanged = shouldShow !== isVisible;

      if (stateChanged) {
        if (shouldShow) transferFocusedLink(primaryNav, floatingNav);
        else transferFocusedLink(floatingNav, primaryNav);
      }

      isVisible = shouldShow;
      floatingNav.classList.toggle('is-visible', shouldShow);
      floatingNav.setAttribute('aria-hidden', shouldShow ? 'false' : 'true');
      floatingNav.toggleAttribute('inert', !shouldShow);
      primaryNav.toggleAttribute('inert', shouldShow);

      if (shouldShow) primaryNav.setAttribute('aria-hidden', 'true');
      else primaryNav.removeAttribute('aria-hidden');
    }

    function updateFloatingNav() {
      const navRect = primaryNav.getBoundingClientRect();
      setFloatingNavVisible(navRect.bottom <= 0);
    }

    if ('IntersectionObserver' in window) {
      const navObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          const hasScrolledPastNav = !entry.isIntersecting && entry.boundingClientRect.bottom <= 0;
          setFloatingNavVisible(hasScrolledPastNav);
        });
      }, { threshold: 0 });

      navObserver.observe(primaryNav);
      window.addEventListener('resize', updateFloatingNav);
      window.addEventListener('pageshow', updateFloatingNav);
    } else {
      let updateRequested = false;

      function requestFloatingNavUpdate() {
        if (updateRequested) return;
        updateRequested = true;
        window.requestAnimationFrame(function () {
          updateRequested = false;
          updateFloatingNav();
        });
      }

      window.addEventListener('scroll', requestFloatingNavUpdate, { passive: true });
      window.addEventListener('resize', requestFloatingNavUpdate);
      window.addEventListener('pageshow', requestFloatingNavUpdate);
    }

    whenSiteReady(updateFloatingNav);
    updateFloatingNav();
  }

  function initPortfolioGuidance() {
    const triggers = Array.from(document.querySelectorAll('[data-portfolio-trigger]'));
    const dialog = document.getElementById('portfolio-access-dialog');
    const confirmLink = dialog && dialog.querySelector('[data-portfolio-access-confirm]');
    const cancelButton = dialog && dialog.querySelector('[data-portfolio-access-cancel]');
    if (!triggers.length || !dialog || dialog.tagName !== 'DIALOG' || !confirmLink || !cancelButton) return;

    let activeTrigger = null;

    function restoreTriggerFocus() {
      if (activeTrigger && activeTrigger.isConnected) activeTrigger.focus({ preventScroll: true });
      activeTrigger = null;
    }

    function closeDialog(returnValue) {
      if (typeof dialog.close === 'function' && dialog.open) {
        dialog.close(returnValue || 'cancel');
      } else {
        dialog.removeAttribute('open');
        dialog.classList.remove('is-keyboard-open');
        restoreTriggerFocus();
      }
    }

    triggers.forEach(function (trigger) {
      trigger.addEventListener('click', function (event) {
        const destination = trigger.getAttribute('href');
        if (!destination) return;

        event.preventDefault();
        activeTrigger = trigger;
        confirmLink.setAttribute('href', destination);
        dialog.classList.toggle('is-keyboard-open', event.detail === 0);

        if (typeof dialog.showModal === 'function') {
          if (!dialog.open) dialog.showModal();
        } else {
          dialog.setAttribute('open', '');
          cancelButton.focus({ preventScroll: true });
        }
      });
    });

    dialog.addEventListener('click', function (event) {
      if (event.target === dialog) closeDialog('cancel');
    });

    dialog.addEventListener('cancel', function (event) {
      event.preventDefault();
      closeDialog('cancel');
    });

    dialog.addEventListener('keydown', function (event) {
      if (event.key !== 'Escape' || !dialog.open) return;
      event.preventDefault();
      closeDialog('cancel');
    });

    dialog.addEventListener('close', function () {
      dialog.classList.remove('is-keyboard-open');
      restoreTriggerFocus();
    });

    cancelButton.addEventListener('click', function () {
      closeDialog('cancel');
    });

    confirmLink.addEventListener('click', function () {
      closeDialog('confirmed');
    });
  }

  function initResumeDownload() {
    const root = document.querySelector('[data-resume-download]');
    if (!root) return;

    const trigger = root.querySelector('[data-resume-download-trigger]');
    const menu = root.querySelector('[data-resume-download-menu]');
    const wordTrigger = root.querySelector('[data-resume-word-trigger]');
    const wordOptions = root.querySelector('[data-resume-word-options]');
    const downloadLinks = Array.from(root.querySelectorAll('a.resume-download-option'));
    if (!trigger || !menu || !wordTrigger || !wordOptions) return;

    function setWordOptionsOpen(isOpen) {
      wordTrigger.setAttribute('aria-expanded', String(isOpen));
      wordOptions.hidden = !isOpen;
    }

    function closeMenu(restoreFocus) {
      root.classList.remove('is-open');
      trigger.setAttribute('aria-expanded', 'false');
      menu.setAttribute('aria-hidden', 'true');
      setWordOptionsOpen(false);
      if (restoreFocus) trigger.focus();
    }

    function openMenu() {
      root.classList.add('is-open');
      trigger.setAttribute('aria-expanded', 'true');
      menu.setAttribute('aria-hidden', 'false');
    }

    trigger.addEventListener('click', function () {
      if (root.classList.contains('is-open')) closeMenu();
      else openMenu();
    });

    trigger.addEventListener('keydown', function (event) {
      if (event.key !== 'ArrowDown') return;
      event.preventDefault();
      openMenu();
      if (downloadLinks[0]) downloadLinks[0].focus();
    });

    wordTrigger.addEventListener('click', function () {
      setWordOptionsOpen(wordTrigger.getAttribute('aria-expanded') !== 'true');
    });

    wordTrigger.addEventListener('keydown', function (event) {
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      setWordOptionsOpen(true);
      const firstWordOption = wordOptions.querySelector('a');
      if (firstWordOption) firstWordOption.focus();
    });

    downloadLinks.forEach(function (downloadLink) {
      downloadLink.addEventListener('click', function () {
        closeMenu();
      });
    });

    document.addEventListener('click', function (event) {
      if (root.classList.contains('is-open') && !root.contains(event.target)) {
        closeMenu();
      }
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && root.classList.contains('is-open')) {
        closeMenu(true);
      }
    });
  }

  function copyContactText(value) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(value).then(function () {
        return true;
      }).catch(function () {
        return fallbackCopyContactText(value);
      });
    }

    return Promise.resolve(fallbackCopyContactText(value));
  }

  function fallbackCopyContactText(value) {
    const textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.top = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();

    try {
      return document.execCommand('copy');
    } catch (error) {
      return false;
    } finally {
      textarea.remove();
    }
  }

  function initContactCopy() {
    const buttons = Array.from(document.querySelectorAll('[data-contact-copy]'));
    const status = document.querySelector('[data-contact-copy-status]');
    if (!buttons.length || !status) return;

    let feedbackTimer = null;

    function showFeedback(button, label, copied) {
      buttons.forEach(function (item) {
        item.classList.remove('is-copied', 'is-copy-failed');
      });

      button.classList.add(copied ? 'is-copied' : 'is-copy-failed');
      status.textContent = copied ? label + '已复制' : label + '复制失败，请手动复制';
      status.classList.add('is-visible');

      window.clearTimeout(feedbackTimer);
      feedbackTimer = window.setTimeout(function () {
        button.classList.remove('is-copied', 'is-copy-failed');
        status.classList.remove('is-visible');
      }, 1600);
    }

    buttons.forEach(function (button) {
      button.addEventListener('click', function () {
        const value = button.getAttribute('data-contact-value') || '';
        const label = button.getAttribute('data-contact-label') || '联系方式';
        if (!value) return;

        copyContactText(value).then(function (copied) {
          showFeedback(button, label, copied);
        });
      });
    });
  }

  function initToolchainIcons() {
    const icons = document.querySelectorAll('.toolchain-icon');
    if (!icons.length) return;

    icons.forEach(function (icon) {
      const mark = icon.closest('.toolchain-mark');
      if (!mark) return;

      const showFallback = function () {
        mark.classList.add('is-icon-fallback');
      };

      icon.addEventListener('error', showFallback, { once: true });
      if (icon.complete && icon.naturalWidth === 0) showFallback();
    });
  }

  function initToolchainCarousel() {
    const carousel = document.querySelector('.toolchain-carousel');
    const loop = carousel && carousel.querySelector('.toolchain-loop');
    const track = loop && loop.querySelector('.toolchain-track');
    const group = track && track.querySelector('.toolchain-group');
    const previous = carousel && carousel.querySelector('[data-toolchain-prev]');
    const next = carousel && carousel.querySelector('[data-toolchain-next]');

    if (!carousel || !loop || !track || !group || !group.children.length || carousel.dataset.ready === 'true') return;

    const items = Array.prototype.slice.call(group.querySelectorAll('.toolchain-item'));
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const duplicate = group.cloneNode(true);
    duplicate.setAttribute('aria-hidden', 'true');
    track.appendChild(duplicate);
    carousel.dataset.ready = 'true';

    let position = 0;
    let groupWidth = 0;
    let speed = 0;
    let lastTime = performance.now();
    let tween = null;

    function normalize(value) {
      if (!groupWidth) return 0;
      const normalized = value % groupWidth;
      return normalized < 0 ? normalized + groupWidth : normalized;
    }

    function render() {
      track.style.transform = 'translate3d(' + (-position).toFixed(3) + 'px, 0, 0)';
    }

    function measure() {
      groupWidth = group.getBoundingClientRect().width;
      speed = groupWidth ? groupWidth / 26000 : 0;
      position = normalize(position);
      render();
    }

    function offsets() {
      return items.map(function (item) {
        return item.offsetLeft;
      });
    }

    function shift(direction) {
      if (!groupWidth) measure();
      if (!groupWidth) return;

      if (tween) {
        position = normalize(tween.to);
        tween = null;
      }

      const itemOffsets = offsets();
      const start = normalize(position);
      let distance;

      if (direction > 0) {
        const nextOffset = itemOffsets.find(function (offset) {
          return offset > start + 1;
        });
        distance = nextOffset === undefined ? groupWidth - start + itemOffsets[0] : nextOffset - start;
      } else {
        let previousOffset;
        for (let index = itemOffsets.length - 1; index >= 0; index -= 1) {
          if (itemOffsets[index] < start - 1) {
            previousOffset = itemOffsets[index];
            break;
          }
        }
        distance = previousOffset === undefined ? start + groupWidth - itemOffsets[itemOffsets.length - 1] : start - previousOffset;
        distance *= -1;
      }

      let from = position;
      if (direction < 0 && from + distance < 0) from += groupWidth;
      const to = from + distance;

      position = from;
      tween = { from: from, to: to, startedAt: performance.now() };
      render();
    }

    function tick(now) {
      const elapsed = Math.min(now - lastTime, 80);
      lastTime = now;

      if (tween) {
        const progress = Math.min((now - tween.startedAt) / 280, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        position = tween.from + (tween.to - tween.from) * eased;
        if (progress >= 1) {
          position = normalize(tween.to);
          tween = null;
        }
      } else if (!reducedMotion.matches) {
        position = normalize(position + speed * (elapsed / 1));
      }

      render();
      window.requestAnimationFrame(tick);
    }

    previous.addEventListener('click', function () {
      shift(-1);
    });

    next.addEventListener('click', function () {
      shift(1);
    });

    loop.addEventListener('keydown', function (event) {
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        shift(-1);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        shift(1);
      }
    });

    if ('ResizeObserver' in window) {
      const resizeObserver = new ResizeObserver(measure);
      resizeObserver.observe(group);
      resizeObserver.observe(loop);
    } else {
      window.addEventListener('resize', measure);
    }

    reducedMotion.addEventListener('change', function () {
      lastTime = performance.now();
    });

    measure();
    window.requestAnimationFrame(tick);
  }

  function initExperienceDialogs() {
    const triggers = Array.from(document.querySelectorAll('[data-experience-dialog-open]'));
    if (!triggers.length) return;

    const lastTriggerByDialog = new WeakMap();

    function closeDialog(dialog) {
      if (!dialog) return;

      if (typeof dialog.close === 'function' && dialog.open) {
        dialog.close();
      } else {
        dialog.removeAttribute('open');
        const fallbackTrigger = lastTriggerByDialog.get(dialog);
        if (fallbackTrigger) fallbackTrigger.focus({ preventScroll: true });
      }
    }

    triggers.forEach(function (trigger) {
      const dialogId = trigger.getAttribute('data-experience-dialog-open');
      const dialog = dialogId ? document.getElementById(dialogId) : null;
      if (!dialog || dialog.tagName !== 'DIALOG') return;

      trigger.addEventListener('click', function (event) {
        lastTriggerByDialog.set(dialog, trigger);
        dialog.classList.toggle('is-keyboard-open', event.detail === 0);

        if (typeof dialog.showModal === 'function') {
          if (!dialog.open) dialog.showModal();
        } else {
          dialog.setAttribute('open', '');
        }
      });

      dialog.addEventListener('click', function (event) {
        if (event.target === dialog) closeDialog(dialog);
      });

      dialog.addEventListener('cancel', function (event) {
        event.preventDefault();
        closeDialog(dialog);
      });

      dialog.addEventListener('keydown', function (event) {
        if (event.key !== 'Escape' || !dialog.open) return;
        event.preventDefault();
        closeDialog(dialog);
      });

      dialog.addEventListener('close', function () {
        dialog.classList.remove('is-keyboard-open');
        const lastTrigger = lastTriggerByDialog.get(dialog);
        if (lastTrigger) lastTrigger.focus({ preventScroll: true });
      });

      const closeButton = dialog.querySelector('.experience-detail-close');
      if (closeButton) {
        closeButton.addEventListener('click', function (event) {
          if (typeof dialog.close !== 'function') {
            event.preventDefault();
            closeDialog(dialog);
          }
        });
      }
    });
  }

  function initGithubAccessDialog() {
    const triggers = Array.from(document.querySelectorAll('[data-github-access-trigger]'));
    const dialog = document.getElementById('github-access-dialog');
    if (!triggers.length || !dialog || dialog.tagName !== 'DIALOG') return;

    const confirmLink = dialog.querySelector('[data-github-access-confirm]');
    const cancelButton = dialog.querySelector('[data-github-access-cancel]');
    if (!confirmLink || !cancelButton) return;

    let activeTrigger = null;

    function restoreTriggerFocus() {
      if (!activeTrigger || !activeTrigger.isConnected) return;
      activeTrigger.focus({ preventScroll: true });
    }

    function closeDialog(returnValue) {
      if (typeof dialog.close === 'function' && dialog.open) {
        dialog.close(returnValue || 'cancel');
      } else {
        dialog.removeAttribute('open');
        dialog.classList.remove('is-keyboard-open');
        restoreTriggerFocus();
      }
    }

    triggers.forEach(function (trigger) {
      trigger.addEventListener('click', function (event) {
        const destination = trigger.getAttribute('href');
        if (!destination) return;

        event.preventDefault();
        activeTrigger = trigger;
        confirmLink.setAttribute('href', destination);
        dialog.classList.toggle('is-keyboard-open', event.detail === 0);

        if (typeof dialog.showModal === 'function') {
          if (!dialog.open) dialog.showModal();
        } else {
          dialog.setAttribute('open', '');
          cancelButton.focus({ preventScroll: true });
        }
      });
    });

    dialog.addEventListener('click', function (event) {
      if (event.target === dialog) closeDialog('cancel');
    });

    dialog.addEventListener('cancel', function (event) {
      event.preventDefault();
      closeDialog('cancel');
    });

    dialog.addEventListener('keydown', function (event) {
      if (event.key !== 'Escape' || !dialog.open) return;
      event.preventDefault();
      closeDialog('cancel');
    });

    dialog.addEventListener('close', function () {
      dialog.classList.remove('is-keyboard-open');
      restoreTriggerFocus();
    });

    cancelButton.addEventListener('click', function () {
      closeDialog('cancel');
    });

    confirmLink.addEventListener('click', function () {
      closeDialog('confirmed');
    });
  }

  function initVideoQualityDialog() {
    const triggers = Array.from(document.querySelectorAll('[data-video-resource]'));
    const dialog = document.getElementById('video-quality-dialog');
    const confirmLink = dialog && dialog.querySelector('[data-video-quality-confirm]');
    const cancelButton = dialog && dialog.querySelector('[data-video-quality-cancel]');
    if (!triggers.length || !dialog || dialog.tagName !== 'DIALOG' || !confirmLink || !cancelButton) return;

    let activeTrigger = null;

    function restoreTriggerFocus() {
      if (activeTrigger && activeTrigger.isConnected) activeTrigger.focus({ preventScroll: true });
      activeTrigger = null;
    }

    function closeDialog(returnValue) {
      if (typeof dialog.close === 'function' && dialog.open) {
        dialog.close(returnValue || 'cancel');
      } else {
        dialog.removeAttribute('open');
        dialog.classList.remove('is-keyboard-open');
        restoreTriggerFocus();
      }
    }

    triggers.forEach(function (trigger) {
      trigger.addEventListener('click', function (event) {
        const destination = trigger.getAttribute('href');
        if (!destination) return;

        event.preventDefault();
        activeTrigger = trigger;
        confirmLink.setAttribute('href', destination);
        dialog.classList.toggle('is-keyboard-open', event.detail === 0);

        if (typeof dialog.showModal === 'function') {
          if (!dialog.open) dialog.showModal();
        } else {
          dialog.setAttribute('open', '');
          cancelButton.focus({ preventScroll: true });
        }
      });
    });

    dialog.addEventListener('click', function (event) {
      if (event.target === dialog) closeDialog('cancel');
    });

    dialog.addEventListener('cancel', function (event) {
      event.preventDefault();
      closeDialog('cancel');
    });

    dialog.addEventListener('keydown', function (event) {
      if (event.key !== 'Escape' || !dialog.open) return;
      event.preventDefault();
      closeDialog('cancel');
    });

    dialog.addEventListener('close', function () {
      dialog.classList.remove('is-keyboard-open');
      restoreTriggerFocus();
    });

    cancelButton.addEventListener('click', function () {
      closeDialog('cancel');
    });

    confirmLink.addEventListener('click', function () {
      closeDialog('confirmed');
    });
  }

  function initPageExperience() {
  initPortfolioGuidance();
  initResumeDownload();
  initContactCopy();
  initToolchainCarousel();
  initToolchainIcons();
  initExperienceDialogs();
  initGithubAccessDialog();
  initVideoQualityDialog();

  if ('IntersectionObserver' in window) {
    document.documentElement.classList.add('js-anim');
  }

  const revealTargets = document.querySelectorAll(
    '.reveal, .text-reveal, .capability-card, .project-card, .timeline-item, .hero-text, .hero-image, .hero-visual, .contact-card, .section-title, .section-subtitle'
  );

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if ('IntersectionObserver' in window && !prefersReducedMotion) {
    const observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12 }
    );

    revealTargets.forEach(function (el) {
      el.classList.add('reveal');
      observer.observe(el);
    });
  } else {
    revealTargets.forEach(function (el) {
      el.classList.add('reveal', 'is-visible');
    });
  }

  initHeroCopySequence();

  const navLinks = Array.from(document.querySelectorAll('.nav-link:not([data-assistant-open])'));
  const sections = navLinks
    .map(function (link) {
      const href = link.getAttribute('href');
      if (!href || href === '#hero') return document.getElementById('hero');
      return document.querySelector(href);
    })
    .filter(Boolean);

  function setActiveNav(id) {
    navLinks.forEach(function (link) {
      const href = link.getAttribute('href');
      const isActive = href === '#' + id;
      link.classList.toggle('is-active', isActive);

      if (isActive) {
        link.setAttribute('aria-current', 'location');
      } else {
        link.removeAttribute('aria-current');
      }
    });
  }

  function updateActiveNav() {
    let current = sections[0];
    sections.forEach(function (section) {
      if (!section) return;
      const rect = section.getBoundingClientRect();
      if (rect.top <= 150) {
        current = section;
      }
    });
    if (current) setActiveNav(current.id);
  }

  updateActiveNav();

  window.addEventListener('scroll', updateActiveNav, { passive: true });
  window.addEventListener('resize', updateActiveNav);

  navLinks.forEach(function (link) {
    link.addEventListener('click', function () {
      const href = link.getAttribute('href');
      if (href && href.startsWith('#')) {
        const id = href.slice(1);
        setActiveNav(id);
      }
    });
  });
  }

  initFloatingNavigation();
  whenSiteReady(initPageExperience);
})();

(function () {
  'use strict';

  function getSafeStorage(name) {
    try {
      return window[name] || null;
    } catch (error) {
      return null;
    }
  }

  // Browser privacy modes, enterprise policies, and full storage quotas can
  // expose a Storage object whose individual methods still throw. Persistence
  // is helpful, but it must never be allowed to interrupt the chat flow.
  function readStorage(store, key, fallback) {
    if (!store) return fallback;
    try {
      const value = store.getItem(key);
      return value === null ? fallback : value;
    } catch (error) {
      return fallback;
    }
  }

  function writeStorage(store, key, value) {
    if (!store) return false;
    try {
      store.setItem(key, value);
      return true;
    } catch (error) {
      return false;
    }
  }

  function removeStorage(store, key) {
    if (!store) return false;
    try {
      store.removeItem(key);
      return true;
    } catch (error) {
      return false;
    }
  }

  const root = document.querySelector('[data-assistant]');
  if (!root) return;

  const panel = document.getElementById('assistant-panel');
  const toggleBtn = root.querySelector('[data-assistant-toggle]');
  const hideBtn = root.querySelector('[data-assistant-hide]');
  const recallBtn = root.querySelector('[data-assistant-recall]');
  const closeBtn = root.querySelector('[data-assistant-close]');
  const clearBtn = root.querySelector('[data-assistant-clear]');
  const messagesEl = root.querySelector('[data-assistant-messages]');
  const form = root.querySelector('[data-assistant-form]');
  const input = root.querySelector('[data-assistant-input]');
  const sendBtn = root.querySelector('[data-assistant-send]');
  const resident = root.querySelector('[data-assistant-resident]');
  const summaryCard = document.querySelector('#hero .hero-summary-card');
  const summaryCopyElements = summaryCard ? Array.from(summaryCard.querySelectorAll([
    '.hero-summary-eyebrow',
    '.hero-summary-title',
    '.hero-summary-intro',
    '.hero-summary-result-label',
    '.hero-summary-result-value',
    '.hero-summary-directions',
    '.hero-summary-assistant p',
    '.hero-summary-chat'
  ].join(','))) : [];
  const promptBtns = Array.from(root.querySelectorAll('[data-assistant-prompt]'));
  const openBtns = Array.from(document.querySelectorAll('[data-assistant-open]'));
  const endpoint = '/api/chat';
  const maxQuestionLength = 800;
  const portfolioLink = 'https://ocnlnp1ta2t2.feishu.cn/drive/folder/Wpm9fd5g4liX9Edxp3pctObYnng';
  const feishuLoginNote = '💡 温馨提示：作品集记录在飞书文档，打开链接前，请先登录您的飞书账号方便查看~';
  const assistantGreeting = '你好呀，我能从招聘视角介绍赵亚杰的 Vibe Coding、AI 工具敏感度、FDE 落地、AI 产品全链路，以及三段实习和 BOSS 直聘开源 Skill，快来提问吧！';
  const storageKey = 'portfolio-text-agent-history-v9';
  const hiddenStorageKey = 'portfolio-text-agent-hidden-v1';
  const maxContextMessages = 12;
  const maxContextMessageLength = 1200;
  const maxContextCharacters = 5600;
  const streamRenderIntervalMs = 60;
  const thinkingStatusIntervalMs = 1400;
  const longThinkingStatusThreshold = 240;
  const shortThinkingStatusMessages = [
    '正在整理回答…',
    '正在核对相关资料…',
    '正在组织表达…'
  ];
  const longThinkingStatusMessages = [
    '正在分析长问题…',
    '正在梳理作品与经历…',
    '正在匹配招聘视角…',
    '正在组织完整回答…'
  ];
  const temporaryAssistantErrors = [
    'AI 服务暂时没有返回有效回答，请稍后再试。',
    'AI 服务暂时没有返回有效回答，请稍后再试',
    'AI 服务暂时不可用，请稍后再试。',
    'AI 服务暂时不可用，请稍后再试',
    '当前访问较多或额度已达到上限，请稍后再试。'
  ];
  const localStore = getSafeStorage('localStorage');
  const sessionStore = getSafeStorage('sessionStorage');
  const idleInputPlaceholder = input.getAttribute('placeholder') || '';
  const desktopFocusQuery = window.matchMedia('(hover: hover) and (pointer: fine)');
  const bottomDockedAssistantQuery = window.matchMedia('(max-width: 74.99rem)');

  let history = loadHistory();
  let isResponding = false;
  let activeRequestController = null;
  let lastOpenTrigger = null;
  let summaryCopyAvoidanceFrame = 0;
  let summaryCopyAvoidanceX = 0;
  let summaryCopyAvoidanceY = 0;
  let summaryCopyViewportMotionTimer = 0;
  let summaryCopyViewportMoving = false;
  let summaryCopyResizeObserver = null;
  let summaryCopyVisibilityObserver = null;

  function createPlainRect(rect, offsetX, offsetY) {
    const x = offsetX || 0;
    const y = offsetY || 0;
    return {
      left: rect.left - x,
      right: rect.right - x,
      top: rect.top - y,
      bottom: rect.bottom - y,
      width: rect.width,
      height: rect.height
    };
  }

  function translatePlainRect(rect, offsetX, offsetY) {
    return {
      left: rect.left + offsetX,
      right: rect.right + offsetX,
      top: rect.top + offsetY,
      bottom: rect.bottom + offsetY,
      width: rect.width,
      height: rect.height
    };
  }

  function expandPlainRect(rect, amount) {
    return {
      left: rect.left - amount,
      right: rect.right + amount,
      top: rect.top - amount,
      bottom: rect.bottom + amount,
      width: rect.width + amount * 2,
      height: rect.height + amount * 2
    };
  }

  function rectanglesOverlap(first, second) {
    return first.left < second.right &&
      first.right > second.left &&
      first.top < second.bottom &&
      first.bottom > second.top;
  }

  function unionPlainRects(rects) {
    if (!rects.length) return null;
    return rects.reduce(function (union, rect) {
      return {
        left: Math.min(union.left, rect.left),
        right: Math.max(union.right, rect.right),
        top: Math.min(union.top, rect.top),
        bottom: Math.max(union.bottom, rect.bottom),
        width: Math.max(union.right, rect.right) - Math.min(union.left, rect.left),
        height: Math.max(union.bottom, rect.bottom) - Math.min(union.top, rect.top)
      };
    });
  }

  function getSummaryCopyRects() {
    const copyRects = [];
    summaryCopyElements.forEach(function (element) {
      if (!element.getClientRects().length) return;

      if (element.classList.contains('hero-summary-chat')) {
        copyRects.push(expandPlainRect(createPlainRect(element.getBoundingClientRect()), 4));
        return;
      }

      const walker = document.createTreeWalker(element, window.NodeFilter ? window.NodeFilter.SHOW_TEXT : 4);
      let textNode = walker.nextNode();
      while (textNode) {
        if (textNode.textContent && textNode.textContent.trim()) {
          const range = document.createRange();
          range.selectNodeContents(textNode);
          Array.from(range.getClientRects()).forEach(function (rect) {
            if (rect.width > 0 && rect.height > 0) {
              copyRects.push(expandPlainRect(createPlainRect(rect), 4));
            }
          });
          range.detach();
        }
        textNode = walker.nextNode();
      }
    });
    return copyRects;
  }

  function getVisibleInterfaceRects() {
    return ['.floating-nav', '.site-header'].map(function (selector) {
      const element = document.querySelector(selector);
      if (!element) return null;
      const style = window.getComputedStyle(element);
      const rect = createPlainRect(element.getBoundingClientRect());
      if (style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) === 0 || element.inert || element.getAttribute('aria-hidden') === 'true' || rect.width <= 0 || rect.height <= 0) return null;
      if (rect.bottom <= 0 || rect.top >= window.innerHeight) return null;
      return expandPlainRect(rect, 4);
    }).filter(Boolean);
  }

  function setSummaryCopyAvoidance(offsetX, offsetY) {
    summaryCopyAvoidanceX = Math.abs(offsetX) < 0.25 ? 0 : offsetX;
    summaryCopyAvoidanceY = Math.abs(offsetY) < 0.25 ? 0 : offsetY;
    if (!resident) return;
    resident.style.setProperty('--assistant-avoid-x', summaryCopyAvoidanceX.toFixed(2) + 'px');
    resident.style.setProperty('--assistant-avoid-y', summaryCopyAvoidanceY.toFixed(2) + 'px');
    root.classList.toggle('is-avoiding-summary-copy', Boolean(summaryCopyAvoidanceX || summaryCopyAvoidanceY));
  }

  function updateSummaryCopyAvoidance() {
    summaryCopyAvoidanceFrame = 0;
    if (!resident || !summaryCard || !toggleBtn) return;

    if (root.classList.contains('is-hidden')) {
      setSummaryCopyAvoidance(0, 0);
      return;
    }

    const cardRect = summaryCard.getBoundingClientRect();
    const visualViewport = window.visualViewport;
    const viewport = {
      left: visualViewport ? visualViewport.offsetLeft : 0,
      top: visualViewport ? visualViewport.offsetTop : 0,
      right: (visualViewport ? visualViewport.offsetLeft + visualViewport.width : window.innerWidth),
      bottom: (visualViewport ? visualViewport.offsetTop + visualViewport.height : window.innerHeight)
    };
    if (cardRect.right <= viewport.left || cardRect.left >= viewport.right || cardRect.bottom <= viewport.top || cardRect.top >= viewport.bottom) {
      setSummaryCopyAvoidance(0, 0);
      return;
    }

    const avatarParts = [toggleBtn, hideBtn].filter(Boolean).map(function (element) {
      return createPlainRect(element.getBoundingClientRect(), summaryCopyAvoidanceX, summaryCopyAvoidanceY);
    });
    const avatarBounds = unionPlainRects(avatarParts);
    const summaryCopyRects = getSummaryCopyRects();
    if (!avatarBounds || !summaryCopyRects.length) {
      setSummaryCopyAvoidance(0, 0);
      return;
    }

    const baseOverlapsCopy = avatarParts.some(function (part) {
      return summaryCopyRects.some(function (copyRect) {
        return rectanglesOverlap(part, copyRect);
      });
    });
    if (!baseOverlapsCopy) {
      setSummaryCopyAvoidance(0, 0);
      return;
    }

    const interfaceRects = getVisibleInterfaceRects();
    const obstacles = summaryCopyRects.concat(interfaceRects);
    const viewportPadding = 8;
    const xOffsets = [
      0,
      summaryCopyAvoidanceX,
      viewport.left + viewportPadding - avatarBounds.left,
      viewport.right - viewportPadding - avatarBounds.right
    ];
    const yOffsets = [
      0,
      summaryCopyAvoidanceY,
      viewport.top + viewportPadding - avatarBounds.top,
      viewport.bottom - viewportPadding - avatarBounds.bottom
    ];
    obstacles.forEach(function (obstacle) {
      xOffsets.push(obstacle.left - avatarBounds.right, obstacle.right - avatarBounds.left);
      yOffsets.push(obstacle.top - avatarBounds.bottom, obstacle.bottom - avatarBounds.top);
    });

    const unique = function (values) {
      return Array.from(new Set(values.map(function (value) {
        return Math.round(value * 4) / 4;
      })));
    };
    const candidateIsSafe = function (candidate, candidateObstacles) {
      const shiftedParts = avatarParts.map(function (part) {
        return translatePlainRect(part, candidate.x, candidate.y);
      });
      const shiftedBounds = unionPlainRects(shiftedParts);
      if (!shiftedBounds || shiftedBounds.left < viewport.left + viewportPadding || shiftedBounds.right > viewport.right - viewportPadding) return false;
      if (shiftedBounds.top < viewport.top + viewportPadding || shiftedBounds.bottom > viewport.bottom - viewportPadding) return false;

      return shiftedParts.every(function (part) {
        return candidateObstacles.every(function (obstacle) {
          return !rectanglesOverlap(part, obstacle);
        });
      });
    };

    const currentCandidate = { x: summaryCopyAvoidanceX, y: summaryCopyAvoidanceY };
    if ((summaryCopyAvoidanceX || summaryCopyAvoidanceY) && candidateIsSafe(currentCandidate, obstacles)) return;

    const candidates = [];
    unique(xOffsets).forEach(function (offsetX) {
      unique(yOffsets).forEach(function (offsetY) {
        candidates.push({
          x: offsetX,
          y: offsetY,
          score: Math.hypot(offsetX * 1.08, offsetY) + (offsetX && offsetY ? 6 : 0)
        });
      });
    });
    candidates.sort(function (first, second) {
      return first.score - second.score;
    });

    const safeCandidate = candidates.find(function (candidate) {
      return candidateIsSafe(candidate, obstacles);
    });

    if (safeCandidate) setSummaryCopyAvoidance(safeCandidate.x, safeCandidate.y);
    else {
      const copySafeCandidate = candidates.find(function (candidate) {
        return candidateIsSafe(candidate, summaryCopyRects);
      });
      if (copySafeCandidate) setSummaryCopyAvoidance(copySafeCandidate.x, copySafeCandidate.y);
    }
  }

  function scheduleSummaryCopyAvoidance() {
    if (summaryCopyViewportMoving) return;
    if (summaryCopyAvoidanceFrame) return;
    summaryCopyAvoidanceFrame = window.requestAnimationFrame(updateSummaryCopyAvoidance);
  }

  function scheduleSummaryCopyAvoidanceAfterViewportMotion() {
    if (!bottomDockedAssistantQuery.matches) {
      if (summaryCopyViewportMotionTimer) window.clearTimeout(summaryCopyViewportMotionTimer);
      summaryCopyViewportMotionTimer = 0;
      summaryCopyViewportMoving = false;
      scheduleSummaryCopyAvoidance();
      return;
    }

    summaryCopyViewportMoving = true;
    if (summaryCopyAvoidanceFrame) {
      window.cancelAnimationFrame(summaryCopyAvoidanceFrame);
      summaryCopyAvoidanceFrame = 0;
    }
    if (summaryCopyViewportMotionTimer) window.clearTimeout(summaryCopyViewportMotionTimer);
    summaryCopyViewportMotionTimer = window.setTimeout(function () {
      summaryCopyViewportMotionTimer = 0;
      summaryCopyViewportMoving = false;
      scheduleSummaryCopyAvoidance();
    }, 160);
  }

  window.addEventListener('scroll', scheduleSummaryCopyAvoidanceAfterViewportMotion, { passive: true });
  window.addEventListener('resize', scheduleSummaryCopyAvoidanceAfterViewportMotion);
  window.addEventListener('hashchange', scheduleSummaryCopyAvoidance);
  window.addEventListener('load', scheduleSummaryCopyAvoidance, { once: true });
  document.addEventListener('site:ready', scheduleSummaryCopyAvoidance, { once: true });
  document.addEventListener('visibilitychange', scheduleSummaryCopyAvoidance);
  document.addEventListener('transitionend', function (event) {
    if (summaryCard && summaryCard.contains(event.target)) scheduleSummaryCopyAvoidance();
  });
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', scheduleSummaryCopyAvoidanceAfterViewportMotion);
    window.visualViewport.addEventListener('scroll', scheduleSummaryCopyAvoidanceAfterViewportMotion);
  }
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(scheduleSummaryCopyAvoidance);
  }
  if ('IntersectionObserver' in window && summaryCard) {
    summaryCopyVisibilityObserver = new IntersectionObserver(scheduleSummaryCopyAvoidance, {
      threshold: [0, 0.01, 0.25, 0.5, 0.75, 1]
    });
    summaryCopyVisibilityObserver.observe(summaryCard);
  }
  if ('ResizeObserver' in window && resident && summaryCard) {
    summaryCopyResizeObserver = new ResizeObserver(scheduleSummaryCopyAvoidance);
    summaryCopyResizeObserver.observe(document.documentElement);
    summaryCopyResizeObserver.observe(resident);
    summaryCopyResizeObserver.observe(summaryCard);
    summaryCopyElements.forEach(function (element) {
      summaryCopyResizeObserver.observe(element);
    });
  }
  window.setTimeout(scheduleSummaryCopyAvoidance, 0);
  window.setTimeout(scheduleSummaryCopyAvoidance, 240);
  window.setTimeout(scheduleSummaryCopyAvoidance, 720);

  function loadHistory() {
    try {
      const parsed = JSON.parse(readStorage(sessionStore, storageKey, '[]'));
      if (!Array.isArray(parsed)) return [];
      return parsed.slice(-18).map(function (item) {
        const role = item && item.role === 'user' ? 'user' : 'bot';
        const text = role === 'bot' ? stripModelThinking(item && item.text) : String((item && item.text) || '');
        return {
          role: role,
          text: text,
          includeInContext: !item || item.includeInContext !== false
        };
      }).filter(function (item) {
        return item.text && !(item.role === 'bot' && (
          isTemporaryAssistantError(item.text) || item.text === assistantGreeting
        ));
      });
    } catch (error) {
      return [];
    }
  }

  function saveHistory() {
    const compact = history.filter(function (item) {
      return item && item.role && item.text;
    }).slice(-18);
    // A blocked/full storage area must not prevent the just-rendered message
    // or the following AI request from continuing.
    writeStorage(sessionStore, storageKey, JSON.stringify(compact));
  }

  function appendMessage(role, text, options) {
    const opts = options || {};
    const messageText = role === 'bot' && !opts.thinking ? stripModelThinking(text) : text;
    const messageState = {
      text: String(messageText || ''),
      historyItem: opts.historyItem || null
    };
    const wrap = document.createElement('div');
    wrap.className = 'assistant-message ' + (role === 'user' ? 'is-user' : 'is-bot');
    if (opts.thinking) wrap.dataset.thinking = 'true';

    const bubble = document.createElement('div');
    bubble.className = 'assistant-bubble';
    if (role === 'bot' && !opts.thinking) {
      bubble.classList.add('is-markdown');
      bubble.innerHTML = renderMarkdown(messageText);
    } else {
      bubble.textContent = messageText;
    }

    const meta = document.createElement('div');
    meta.className = 'assistant-meta';
    meta.textContent = role === 'user' ? '你' : 'AI求职小杰君';

    if (!opts.skipHistory && !opts.thinking) {
      messageState.historyItem = { role: role, text: messageState.text, includeInContext: true };
      history.push(messageState.historyItem);
      saveHistory();
    }

    wrap.appendChild(bubble);
    if (!opts.thinking) {
      if (role === 'user') {
        wrap.appendChild(createUserMessageActions(wrap, messageState, bubble));
      } else if (opts.copyable !== false && !isTemporaryAssistantError(messageState.text)) {
        wrap.appendChild(createAssistantMessageActions(messageState));
      }
    }
    wrap.appendChild(meta);
    messagesEl.appendChild(wrap);
    if (opts.autoScroll !== false) messagesEl.scrollTop = messagesEl.scrollHeight;

    return wrap;
  }

  function createUserMessageActions(wrap, messageState, bubble) {
    const actions = document.createElement('div');
    actions.className = 'assistant-message-actions';

    const copyBtn = createCopyMessageButton(messageState, false);

    const editBtn = createMessageActionButton('编辑', [
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">',
      '<path d="M12 20h9"></path>',
      '<path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"></path>',
      '</svg>'
    ].join(''));

    editBtn.addEventListener('click', function () {
      startInlineMessageEdit(wrap, bubble, actions, messageState);
    });

    actions.appendChild(copyBtn);
    actions.appendChild(editBtn);
    return actions;
  }

  function createAssistantMessageActions(messageState) {
    const actions = document.createElement('div');
    actions.className = 'assistant-message-actions assistant-message-actions-bot';
    actions.appendChild(createCopyMessageButton(messageState, true));
    return actions;
  }

  function createCopyMessageButton(messageState, showLabel) {
    const labelHtml = showLabel
      ? '<span class="assistant-message-action-label" data-action-label>复制</span>'
      : '';
    const copyBtn = createMessageActionButton('复制', [
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">',
      '<rect width="14" height="14" x="8" y="8" rx="2"></rect>',
      '<path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path>',
      '</svg>',
      labelHtml
    ].join(''));

    if (showLabel) copyBtn.classList.add('assistant-message-copy-answer');
    copyBtn.addEventListener('click', function () {
      copyTextToClipboard(messageState.text).then(function (copied) {
        setActionFeedback(copyBtn, copied ? '已复制' : '复制失败', copied ? 'success' : 'error');
      }).catch(function () {
        setActionFeedback(copyBtn, '复制失败', 'error');
      });
    });
    return copyBtn;
  }

  function createMessageActionButton(label, iconHtml) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'assistant-message-action';
    button.setAttribute('aria-label', label);
    button.title = label;
    button.innerHTML = iconHtml;
    return button;
  }

  function startInlineMessageEdit(wrap, bubble, actions, messageState) {
    if (isResponding || bubble.dataset.editing === 'true') return;

    const originalText = messageState.text;
    bubble.dataset.editing = 'true';
    bubble.classList.add('is-editing');
    actions.dataset.editing = 'true';
    bubble.textContent = '';

    const textarea = document.createElement('textarea');
    textarea.className = 'assistant-edit-textarea';
    textarea.value = originalText;
    textarea.rows = Math.min(6, Math.max(2, originalText.split('\n').length));
    textarea.setAttribute('aria-label', '编辑这条消息');

    const controls = document.createElement('div');
    controls.className = 'assistant-edit-controls';

    const saveBtn = createMessageActionButton('保存', [
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">',
      '<path d="M20 6 9 17l-5-5"></path>',
      '</svg>'
    ].join(''));
    saveBtn.classList.add('assistant-edit-action');

    const cancelBtn = createMessageActionButton('取消', [
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">',
      '<path d="M18 6 6 18"></path>',
      '<path d="m6 6 12 12"></path>',
      '</svg>'
    ].join(''));
    cancelBtn.classList.add('assistant-edit-action');

    function finishEdit(nextText) {
      if (isResponding) {
        textarea.focus();
        return;
      }

      const displayText = nextText.trim();
      if (!displayText) {
        textarea.focus();
        return;
      }

      if (displayText === originalText) {
        cancelEdit();
        return;
      }

      messageState.text = displayText;
      if (messageState.historyItem) {
        messageState.historyItem.text = displayText;
        messageState.historyItem.includeInContext = true;
      }
      saveHistory();

      bubble.classList.remove('is-editing');
      delete bubble.dataset.editing;
      delete actions.dataset.editing;
      bubble.textContent = displayText;
      regenerateFromEditedMessage(wrap, messageState, displayText);
    }

    function cancelEdit() {
      bubble.classList.remove('is-editing');
      delete bubble.dataset.editing;
      delete actions.dataset.editing;
      bubble.textContent = originalText;
    }

    saveBtn.addEventListener('click', function (event) {
      event.stopPropagation();
      finishEdit(textarea.value);
    });

    cancelBtn.addEventListener('click', function (event) {
      event.stopPropagation();
      cancelEdit();
    });

    textarea.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        cancelEdit();
      } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        finishEdit(textarea.value);
      }
    });

    controls.appendChild(cancelBtn);
    controls.appendChild(saveBtn);
    bubble.appendChild(textarea);
    bubble.appendChild(controls);
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  }

  async function regenerateFromEditedMessage(wrap, messageState, question) {
    if (isResponding) return;

    let nextMessage = wrap.nextElementSibling;
    while (nextMessage) {
      const messageToRemove = nextMessage;
      nextMessage = nextMessage.nextElementSibling;
      messageToRemove.remove();
    }

    if (messageState.historyItem) {
      const messageIndex = history.indexOf(messageState.historyItem);
      if (messageIndex >= 0) {
        history = history.slice(0, messageIndex + 1);
      }
      saveHistory();
    }

    await runAssistantResponse(question, messageState.historyItem);
  }

  function excludeHistoryItemFromContext(item) {
    if (!item || item.includeInContext === false) return;
    item.includeInContext = false;
    saveHistory();
  }

  function setActionFeedback(button, label, state) {
    const originalLabel = button.dataset.originalLabel
      || button.getAttribute('aria-label')
      || '';
    const originalTitle = button.dataset.originalTitle
      || button.title
      || originalLabel;
    const visibleLabel = button.querySelector('[data-action-label]');
    const originalVisibleLabel = button.dataset.originalVisibleLabel
      || (visibleLabel ? visibleLabel.textContent : '');

    button.dataset.originalLabel = originalLabel;
    button.dataset.originalTitle = originalTitle;
    if (visibleLabel) button.dataset.originalVisibleLabel = originalVisibleLabel;
    button.setAttribute('aria-label', label);
    button.title = label;
    button.dataset.feedback = state || 'success';
    if (visibleLabel) visibleLabel.textContent = label;

    if (button._assistantFeedbackTimer) {
      window.clearTimeout(button._assistantFeedbackTimer);
    }

    button._assistantFeedbackTimer = window.setTimeout(function () {
      button.setAttribute('aria-label', originalLabel);
      button.title = originalTitle;
      if (visibleLabel) visibleLabel.textContent = originalVisibleLabel;
      delete button.dataset.feedback;
      delete button.dataset.originalLabel;
      delete button.dataset.originalTitle;
      delete button.dataset.originalVisibleLabel;
      delete button._assistantFeedbackTimer;
    }, 1400);
  }

  function copyTextToClipboard(text) {
    const value = String(text || '');
    if (navigator.clipboard && window.isSecureContext) {
      try {
        return Promise.resolve(navigator.clipboard.writeText(value)).then(function () {
          return true;
        }).catch(function () {
          return fallbackCopyText(value);
        });
      } catch (error) {
        return Promise.resolve(fallbackCopyText(value));
      }
    }
    return Promise.resolve(fallbackCopyText(value));
  }

  function fallbackCopyText(text) {
    let textarea = null;

    try {
      textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.top = '-9999px';
      document.body.appendChild(textarea);
      textarea.select();
      return document.execCommand('copy');
    } catch (error) {
      return false;
    } finally {
      if (textarea && textarea.parentNode) textarea.remove();
    }
  }

  function renderMarkdown(markdown) {
    const lines = String(markdown || '').replace(/\r\n/g, '\n').split('\n');
    const html = [];
    let index = 0;

    while (index < lines.length) {
      const line = lines[index];
      const trimmed = line.trim();
      if (!trimmed) {
        index += 1;
        continue;
      }

      if (/^```/.test(trimmed)) {
        const code = [];
        index += 1;
        while (index < lines.length && !/^```/.test(lines[index].trim())) {
          code.push(lines[index]);
          index += 1;
        }
        if (index < lines.length) index += 1;
        html.push('<pre><code>' + escapeHtml(code.join('\n')) + '</code></pre>');
        continue;
      }

      if (isTableStart(lines, index)) {
        html.push(renderTable(lines, index));
        index += 2;
        while (index < lines.length && lines[index].includes('|') && lines[index].trim()) {
          index += 1;
        }
        continue;
      }

      const heading = trimmed.match(/^(#{1,4})\s+(.+)$/);
      if (heading) {
        const level = Math.min(heading[1].length + 2, 5);
        html.push('<h' + level + '>' + renderInlineMarkdown(heading[2]) + '</h' + level + '>');
        index += 1;
        continue;
      }

      const listType = getListType(line);
      if (listType) {
        const tag = listType === 'ordered' ? 'ol' : 'ul';
        const orderedStart = listType === 'ordered'
          ? Number.parseInt((line.match(/^\s*(\d+)[.)]\s+/) || [])[1], 10)
          : null;
        const startAttribute = Number.isFinite(orderedStart)
          ? ' start="' + orderedStart + '"'
          : '';
        const items = [];
        while (index < lines.length && getListType(lines[index]) === listType) {
          const itemLines = [lines[index].replace(/^\s*(?:[-*+]\s+|\d+[.)]\s+)/, '')];
          index += 1;
          while (
            index < lines.length &&
            lines[index].trim() &&
            !getListType(lines[index]) &&
            /^\s{2,}\S/.test(lines[index])
          ) {
            itemLines.push(lines[index].trim());
            index += 1;
          }
          items.push(itemLines);
        }
        html.push('<' + tag + startAttribute + '>' + items.map(function (item) {
          return '<li>' + item.map(function (itemLine) {
            return renderInlineMarkdown(itemLine.trim());
          }).join('<br>') + '</li>';
        }).join('') + '</' + tag + '>');
        continue;
      }

      if (/^>\s?/.test(line)) {
        const quotes = [];
        while (index < lines.length && /^>\s?/.test(lines[index])) {
          quotes.push(lines[index].replace(/^>\s?/, ''));
          index += 1;
        }
        html.push('<blockquote>' + quotes.map(renderInlineMarkdown).join('<br>') + '</blockquote>');
        continue;
      }

      const paragraph = [];
      while (
        index < lines.length &&
        lines[index].trim() &&
        !/^```/.test(lines[index].trim()) &&
        !/^(#{1,4})\s+/.test(lines[index].trim()) &&
        !getListType(lines[index]) &&
        !/^>\s?/.test(lines[index]) &&
        !isTableStart(lines, index)
      ) {
        paragraph.push(lines[index]);
        index += 1;
      }
      html.push('<p>' + paragraph.map(function (item) {
        return renderInlineMarkdown(item.trim());
      }).join('<br>') + '</p>');
    }

    return html.join('');
  }

  function isTableStart(lines, index) {
    if (!lines[index] || !lines[index].includes('|') || !lines[index + 1]) return false;
    return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(lines[index + 1]);
  }

  function renderTable(lines, startIndex) {
    const headers = parseTableRow(lines[startIndex]);
    const rows = [];
    let index = startIndex + 2;
    while (index < lines.length && lines[index].includes('|') && lines[index].trim()) {
      rows.push(parseTableRow(lines[index]));
      index += 1;
    }

    return [
      '<div class="assistant-table-wrap"><table>',
      '<thead><tr>',
      headers.map(function (cell) { return '<th>' + renderInlineMarkdown(cell) + '</th>'; }).join(''),
      '</tr></thead><tbody>',
      rows.map(function (row) {
        return '<tr>' + headers.map(function (_, cellIndex) {
          return '<td>' + renderInlineMarkdown(row[cellIndex] || '') + '</td>';
        }).join('') + '</tr>';
      }).join(''),
      '</tbody></table></div>'
    ].join('');
  }

  function parseTableRow(line) {
    return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(function (cell) {
      return cell.trim();
    });
  }

  function getListType(line) {
    if (/^\s*\d+[.)]\s+/.test(line)) return 'ordered';
    if (/^\s*[-*+]\s+/.test(line)) return 'unordered';
    return '';
  }

  function renderInlineMarkdown(text) {
    const links = [];
    const withTokens = String(text || '').replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/gi, function (_, label, url) {
      const safeUrl = sanitizeUrl(url);
      if (!safeUrl) return label;
      const token = '\u0000LINK' + links.length + '\u0000';
      links.push('<a href="' + escapeAttribute(safeUrl) + '" target="_blank" rel="noreferrer">' + escapeHtml(label) + '</a>');
      return token;
    });

    let html = escapeHtml(withTokens);
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/https?:\/\/[^\s<]+/g, function (url) {
      let clean = url;
      let suffix = '';
      while (/[),.，。！？；：]$/.test(clean)) {
        suffix = clean.slice(-1) + suffix;
        clean = clean.slice(0, -1);
      }
      const safeUrl = sanitizeUrl(clean.replace(/&amp;/g, '&'));
      if (!safeUrl) return url;
      return '<a href="' + escapeAttribute(safeUrl) + '" target="_blank" rel="noreferrer">' + clean + '</a>' + suffix;
    });

    links.forEach(function (link, linkIndex) {
      html = html.replace('\u0000LINK' + linkIndex + '\u0000', link);
    });
    return html;
  }

  function sanitizeUrl(url) {
    const value = String(url || '').trim();
    if (!/^https?:\/\//i.test(value)) return '';
    return value.replace(/[\u0000-\u001F\u007F\s]+/g, '');
  }

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, function (char) {
      return {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      }[char];
    });
  }

  function escapeAttribute(value) {
    return escapeHtml(value).replace(/`/g, '&#96;');
  }

  function parseModelResponse(data) {
    if (!data) return '';
    if (typeof data === 'string') return data;
    if (typeof data.answer === 'string') return data.answer;
    if (typeof data.message === 'string') return data.message;
    if (typeof data.content === 'string') return data.content;
    if (data.data) return parseModelResponse(data.data);
    if (Array.isArray(data.choices) && data.choices[0]) {
      const choice = data.choices[0];
      return parseModelResponse(choice.message || choice);
    }
    return '';
  }

  function isTemporaryAssistantError(text) {
    return temporaryAssistantErrors.includes(String(text || '').trim());
  }

  function stripModelThinking(value) {
    let text = String(value || '').replace(/\r\n/g, '\n');

    text = text
      .replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, '')
      .replace(/<reasoning\b[^>]*>[\s\S]*?<\/reasoning>/gi, '')
      .replaceAll('【回答完毕】', '');

    const finalAnswerMatch = text.match(/(?:^|\n)\s*(?:最终答案|正式回答|答案|回答|Final Answer)\s*[:：]\s*/i);
    if (finalAnswerMatch) {
      text = text.slice(finalAnswerMatch.index + finalAnswerMatch[0].length);
    }

    text = text
      .replace(/^\s*(?:思考过程|推理过程|分析过程|Thought process|Reasoning)\s*[:：][\s\S]*?(?:\n\s*\n)+/i, '')
      .replace(/<think\b[^>]*>[\s\S]*$/gi, '')
      .replace(/<reasoning\b[^>]*>[\s\S]*$/gi, '')
      .replace(/<\/(?:think|reasoning)>/gi, '');

    return normalizePortfolioOutput(text).trim();
  }

  function normalizePortfolioOutput(value) {
    const formatted = '飞书作品集：' + portfolioLink + '\n\n' + feishuLoginNote;
    const inlineNote = new RegExp(
      escapeRegExp(portfolioLink) + '\\s*[（(][^\\n]*温馨提示[^\\n]*[）)]',
      'gi'
    );

    return String(value || '')
      .replace(
        /\[[^\]]*Wpm9fd5g4liX9Edxp3pctObYnng[^\]]*\]\(https?:\/\/[^)\s]*Wpm9fd5g4liX9Edxp3pctObYnng[^)]*\)/gi,
        formatted
      )
      .replace(inlineNote, portfolioLink + '\n\n' + feishuLoginNote)
      .replace(
        /(^|\n)\s*(?:💡\s*)?温馨提示：作品集[^\n]*?飞书账号[^\n]*?(?:[。~～]|$)/g,
        '$1' + feishuLoginNote
      );
  }

  function escapeRegExp(value) {
    return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function renderHistory() {
    messagesEl.textContent = '';
    if (!history.length) {
      appendMessage(
        'bot',
        assistantGreeting,
        { skipHistory: true, copyable: false }
      );
      return;
    }
    history.forEach(function (item) {
      appendMessage(item.role, item.text, { skipHistory: true, historyItem: item });
    });
  }

  function shouldAutoFocusInput() {
    return desktopFocusQuery.matches && window.innerWidth >= 768;
  }

  function setOpen(isOpen, trigger) {
    if (isOpen && trigger && typeof trigger.focus === 'function') {
      lastOpenTrigger = trigger;
    }

    root.classList.toggle('is-open', isOpen);
    document.documentElement.classList.toggle('assistant-open', isOpen);

    const floatingNav = document.querySelector('[data-floating-nav]');
    const siteHeader = document.querySelector('.site-header');
    const primaryNav = document.querySelector('.site-header .nav-links');
    if (isOpen) {
      if (siteHeader) {
        siteHeader.setAttribute('aria-hidden', 'true');
        siteHeader.setAttribute('inert', '');
      }
      if (floatingNav) {
        floatingNav.setAttribute('aria-hidden', 'true');
        floatingNav.setAttribute('inert', '');
      }
      if (primaryNav) {
        primaryNav.setAttribute('aria-hidden', 'true');
        primaryNav.setAttribute('inert', '');
      }
    } else {
      const floatingNavVisible = Boolean(floatingNav && floatingNav.classList.contains('is-visible'));
      if (siteHeader) {
        siteHeader.removeAttribute('aria-hidden');
        siteHeader.removeAttribute('inert');
      }
      if (floatingNav) {
        floatingNav.setAttribute('aria-hidden', floatingNavVisible ? 'false' : 'true');
        floatingNav.toggleAttribute('inert', !floatingNavVisible);
      }
      if (primaryNav) {
        primaryNav.setAttribute('aria-hidden', floatingNavVisible ? 'true' : 'false');
        primaryNav.toggleAttribute('inert', floatingNavVisible);
      }
    }

    panel.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
    panel.toggleAttribute('inert', !isOpen);
    toggleBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    openBtns.forEach(function (button) {
      button.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });

    if (isOpen && shouldAutoFocusInput()) {
      window.setTimeout(function () {
        input.focus();
      }, 120);
    } else if (!isOpen && panel.contains(document.activeElement) && lastOpenTrigger) {
      lastOpenTrigger.focus({ preventScroll: true });
    }

    scheduleSummaryCopyAvoidance();
  }

  function setHidden(isHidden, options) {
    const opts = options || {};
    if (isHidden) setOpen(false);
    root.classList.toggle('is-hidden', isHidden);
    if (recallBtn) recallBtn.setAttribute('aria-hidden', isHidden ? 'false' : 'true');
    if (opts.persist !== false) writeStorage(localStore, hiddenStorageKey, isHidden ? 'true' : 'false');
    scheduleSummaryCopyAvoidance();
  }

  function setResponding(nextState) {
    isResponding = Boolean(nextState);
    root.classList.toggle('is-responding', isResponding);
    form.dataset.responding = isResponding ? 'true' : 'false';
    sendBtn.dataset.state = isResponding ? 'responding' : 'idle';
    sendBtn.type = isResponding ? 'button' : 'submit';
    sendBtn.setAttribute('aria-label', isResponding ? '停止生成' : '发送问题');
    sendBtn.title = isResponding ? '停止生成' : '发送问题';
    input.readOnly = isResponding;
    input.placeholder = isResponding ? 'AI 正在回答，可点击停止' : idleInputPlaceholder;
    if (clearBtn) clearBtn.disabled = isResponding;
    promptBtns.forEach(function (button) {
      button.disabled = isResponding;
    });
  }

  function stopActiveResponse() {
    if (!isResponding || !activeRequestController || activeRequestController.signal.aborted) return;
    sendBtn.setAttribute('aria-label', '正在停止生成');
    sendBtn.title = '正在停止生成';
    activeRequestController.abort();
  }

  function isAbortError(error, signal) {
    return Boolean(
      (signal && signal.aborted) ||
      (error && (error.name === 'AbortError' || error.code === 20))
    );
  }

  function getAssistantRequestErrorMessage(error) {
    const status = Number(error && error.status);
    if (status === 408 || status === 504) return '';
    if (error && error.userMessage) return error.userMessage;
    if (status === 429) return '当前访问较多或额度已达到上限，请稍后再试。';
    if (status === 400 && error && error.code === 'MISSING_MESSAGE') return '请输入问题后再发送。';
    if (status === 413) return (error && error.userMessage) || ('问题请控制在 ' + maxQuestionLength + ' 个字符以内。');
    return 'AI 服务暂时不可用，请稍后再试。';
  }

  function buildConversationContext(currentUserHistoryItem) {
    const currentIndex = currentUserHistoryItem ? history.indexOf(currentUserHistoryItem) : history.length;
    const historyEnd = currentIndex >= 0 ? currentIndex : history.length;
    const candidates = history.slice(0, historyEnd).filter(function (item) {
      return item && item.includeInContext !== false && (item.role === 'user' || item.role === 'bot') && item.text;
    });
    const selected = [];
    let usedCharacters = 0;

    for (let index = candidates.length - 1; index >= 0 && selected.length < maxContextMessages; index -= 1) {
      const remainingCharacters = maxContextCharacters - usedCharacters;
      if (remainingCharacters <= 0) break;

      const item = candidates[index];
      const content = String(item.text || '')
        .trim()
        .slice(0, Math.min(maxContextMessageLength, remainingCharacters));
      if (!content) continue;

      selected.unshift({
        role: item.role === 'user' ? 'user' : 'assistant',
        content: content
      });
      usedCharacters += content.length;
    }

    while (selected.length && selected[0].role !== 'user') selected.shift();
    return selected;
  }

  async function callModel(question, conversationHistory, onStreamUpdate, signal, onStreamStatus) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: signal,
        body: JSON.stringify({
          message: question,
          history: conversationHistory,
          mode: 'text'
        })
      });

      if (!response.ok) {
        const errorPayload = await response.json().catch(function () { return {}; });
        const requestError = new Error(errorPayload.message || errorPayload.error || 'Bad response');
        requestError.status = response.status;
        requestError.code = errorPayload.code || errorPayload.error || '';
        requestError.userMessage = typeof errorPayload.message === 'string'
          ? errorPayload.message
          : '';
        throw requestError;
      }
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('text/event-stream') && response.body) {
        return await readModelStream(response, onStreamUpdate, onStreamStatus);
      }
      const payload = contentType.includes('application/json') ? await response.json() : await response.text();
      const answer = stripModelThinking(parseModelResponse(payload)).trim();
      return answer || 'AI 服务暂时没有返回有效回答，请稍后再试。';
    } catch (error) {
      if (isAbortError(error, signal)) throw error;
      throw error;
    }
  }

  async function readModelStream(response, onStreamUpdate, onStreamStatus) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let answer = '';
    let receivedDone = false;

    function consumeEvent(block) {
      if (!block.trim()) return;
      const lines = block.split(/\r?\n/);
      const eventLine = lines.find(function (line) { return line.startsWith('event:'); });
      const eventName = eventLine ? eventLine.slice(6).trim() : 'message';
      const dataText = lines.filter(function (line) { return line.startsWith('data:'); }).map(function (line) {
        return line.slice(5).trim();
      }).join('\n');
      if (!dataText) return;

      const data = JSON.parse(dataText);
      if (eventName === 'status') {
        if (typeof onStreamStatus === 'function') onStreamStatus(data);
        return;
      }
      if (eventName === 'error') {
        const streamError = new Error(data.error || 'Stream failed');
        streamError.status = Number(data.status) || (data.code === 'AI_REQUEST_TIMEOUT' ? 504 : 0);
        streamError.code = data.code || '';
        streamError.userMessage = typeof data.message === 'string' ? data.message : '';
        streamError.partialAnswer = typeof data.answer === 'string' ? data.answer : answer;
        throw streamError;
      }
      if (eventName === 'delta' && typeof data.delta === 'string') {
        answer += data.delta;
        if (typeof onStreamUpdate === 'function') onStreamUpdate(answer);
      }
      if (eventName === 'done' && typeof data.answer === 'string') {
        answer = data.answer;
        receivedDone = true;
        if (data.complete === false) {
          const incompleteError = new Error('Stream ended with an incomplete answer');
          incompleteError.partialAnswer = answer;
          throw incompleteError;
        }
      }
    }

    try {
      while (!receivedDone) {
        const chunk = await reader.read();
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });
        const events = buffer.split(/\r?\n\r?\n/);
        buffer = events.pop() || '';
        for (const eventBlock of events) {
          consumeEvent(eventBlock);
          if (receivedDone) break;
        }
      }

      if (receivedDone) {
        try {
          await reader.cancel();
        } catch (error) {
          // The semantic done event already delivered a complete answer.
        }
      } else {
        buffer += decoder.decode();
        if (buffer) consumeEvent(buffer);
      }
      if (!receivedDone) {
        const incompleteError = new Error('Stream ended before the done event');
        incompleteError.partialAnswer = answer;
        throw incompleteError;
      }
    } catch (error) {
      if (error && error.partialAnswer === undefined) error.partialAnswer = answer;
      try {
        await reader.cancel();
      } catch (cancelError) {
        // Preserve the original stream error.
      }
      throw error;
    }

    answer = stripModelThinking(answer).trim();
    return answer || 'AI 服务暂时没有返回有效回答，请稍后再试。';
  }

  function autoResizeInput() {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 120) + 'px';
  }

  async function runAssistantResponse(question, currentUserHistoryItem) {
    if (isResponding) return;

    const requestController = new AbortController();
    activeRequestController = requestController;
    setResponding(true);
    messagesEl.setAttribute('aria-busy', 'true');
    const thinkingStatusMessages = question.length >= longThinkingStatusThreshold
      ? longThinkingStatusMessages
      : shortThinkingStatusMessages;
    let thinkingStatusIndex = 0;
    let thinkingStatusTimer = 0;
    const thinking = appendMessage('bot', thinkingStatusMessages[0], {
      thinking: true,
      skipHistory: true
    });

    const bubble = thinking.querySelector('.assistant-bubble');
    let isStreaming = false;
    let streamedAnswer = '';
    let pendingStreamAnswer = '';
    let streamRenderTimer = 0;

    function stopLocalThinkingStatusLoop() {
      if (!thinkingStatusTimer) return;
      window.clearInterval(thinkingStatusTimer);
      thinkingStatusTimer = 0;
    }

    function advanceLocalThinkingStatus() {
      if (isStreaming || requestController.signal.aborted) {
        stopLocalThinkingStatusLoop();
        return;
      }
      thinkingStatusIndex = (thinkingStatusIndex + 1) % thinkingStatusMessages.length;
      bubble.textContent = thinkingStatusMessages[thinkingStatusIndex];
    }

    function shouldFollowAssistantStream() {
      return messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight < 80;
    }

    function flushStreamRender() {
      streamRenderTimer = 0;
      const visibleAnswer = stripModelThinking(pendingStreamAnswer).trim();
      if (!visibleAnswer || requestController.signal.aborted) return;

      const shouldFollowStream = shouldFollowAssistantStream();
      streamedAnswer = visibleAnswer;
      if (!isStreaming) {
        isStreaming = true;
        delete thinking.dataset.thinking;
        bubble.classList.add('is-markdown');
      }
      bubble.innerHTML = renderMarkdown(visibleAnswer);
      if (shouldFollowStream) messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function scheduleStreamRender(partialAnswer) {
      pendingStreamAnswer = partialAnswer;
      if (streamRenderTimer) return;
      streamRenderTimer = window.setTimeout(flushStreamRender, streamRenderIntervalMs);
    }

    function cancelPendingStreamRender() {
      if (!streamRenderTimer) return;
      window.clearTimeout(streamRenderTimer);
      streamRenderTimer = 0;
    }

    function applyStreamStatus(status) {
      if (isStreaming || requestController.signal.aborted || !status || thinkingStatusTimer) return;
      const message = typeof status.message === 'string' ? status.message.trim() : '';
      if (!message) return;
      const statusBubble = thinking.querySelector('.assistant-bubble');
      if (statusBubble) statusBubble.textContent = message;
    }

    thinkingStatusTimer = window.setInterval(advanceLocalThinkingStatus, thinkingStatusIntervalMs);

    try {
      const conversationHistory = buildConversationContext(currentUserHistoryItem);
      const answer = await callModel(question, conversationHistory, function (partialAnswer) {
        if (!partialAnswer || requestController.signal.aborted) return;
        stopLocalThinkingStatusLoop();
        scheduleStreamRender(partialAnswer);
      }, requestController.signal, applyStreamStatus);

      cancelPendingStreamRender();
      const shouldFollowStream = shouldFollowAssistantStream();
      thinking.remove();
      appendMessage('bot', answer, {
        skipHistory: isTemporaryAssistantError(answer),
        autoScroll: shouldFollowStream
      });
      if (isTemporaryAssistantError(answer)) excludeHistoryItemFromContext(currentUserHistoryItem);
    } catch (error) {
      cancelPendingStreamRender();
      if (requestController.signal.aborted && (streamedAnswer || pendingStreamAnswer)) {
        const stoppedAnswer = stripModelThinking(pendingStreamAnswer || streamedAnswer).trim();
        const shouldFollowStream = shouldFollowAssistantStream();
        thinking.remove();
        appendMessage('bot', stoppedAnswer + '\n\n> 已停止生成。', { autoScroll: shouldFollowStream });
      } else if (!isAbortError(error, requestController.signal) && (error.partialAnswer || streamedAnswer || pendingStreamAnswer)) {
        const partialAnswer = stripModelThinking(error.partialAnswer || streamedAnswer || pendingStreamAnswer).trim();
        const errorStatus = Number(error && error.status);
        const hasServiceFailure = Boolean(
          error && (
            error.userMessage ||
            errorStatus === 408 ||
            errorStatus === 429 ||
            errorStatus === 502 ||
            errorStatus === 503 ||
            errorStatus === 504
          )
        );
        const requestErrorMessage = getAssistantRequestErrorMessage(error);
        const partialFailureNotice = hasServiceFailure && requestErrorMessage
          ? '\n\n> ' + requestErrorMessage
          : '';
        const shouldFollowStream = shouldFollowAssistantStream();
        thinking.remove();
        appendMessage('bot', partialAnswer + partialFailureNotice, {
          skipHistory: true,
          autoScroll: shouldFollowStream
        });
        excludeHistoryItemFromContext(currentUserHistoryItem);
      } else if (!isAbortError(error, requestController.signal)) {
        const shouldFollowStream = shouldFollowAssistantStream();
        const requestErrorMessage = getAssistantRequestErrorMessage(error);
        thinking.remove();
        if (requestErrorMessage) {
          appendMessage('bot', requestErrorMessage, {
            skipHistory: true,
            autoScroll: shouldFollowStream
          });
        }
        excludeHistoryItemFromContext(currentUserHistoryItem);
      } else {
        thinking.remove();
        excludeHistoryItemFromContext(currentUserHistoryItem);
      }
    } finally {
      stopLocalThinkingStatusLoop();
      if (activeRequestController === requestController) {
        activeRequestController = null;
        setResponding(false);
      }
      messagesEl.setAttribute('aria-busy', 'false');
    }
  }

  async function ask(question) {
    const text = String(question || '').trim();
    if (!text || isResponding) return;

    if (text.length > maxQuestionLength) {
      appendMessage('bot', '问题请控制在 ' + maxQuestionLength + ' 个字符以内。', {
        skipHistory: true,
        autoScroll: true
      });
      return;
    }

    appendMessage('user', text);
    const currentUserHistoryItem = history[history.length - 1];
    input.value = '';
    autoResizeInput();
    await runAssistantResponse(text, currentUserHistoryItem);
  }

  toggleBtn.addEventListener('click', function (event) {
    setOpen(!root.classList.contains('is-open'), event.currentTarget);
  });

  openBtns.forEach(function (button) {
    button.addEventListener('click', function (event) {
      event.preventDefault();
      setHidden(false);
      setOpen(true, button);
    });
  });

  if (hideBtn) {
    hideBtn.addEventListener('click', function (event) {
      event.stopPropagation();
      setHidden(true);
    });
  }

  if (recallBtn) {
    recallBtn.addEventListener('click', function () {
      setHidden(false);
    });
  }

  closeBtn.addEventListener('click', function () {
    setOpen(false);
  });

  document.addEventListener('click', function (event) {
    if (!root.classList.contains('is-open')) return;

    const target = event.target;
    const eventPath = typeof event.composedPath === 'function' ? event.composedPath() : [];
    if (eventPath.includes(panel) || !(target instanceof Node) || panel.contains(target)) return;
    if (toggleBtn.contains(target)) return;
    if (openBtns.some(function (button) { return button.contains(target); })) return;

    setOpen(false);
  });

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && root.classList.contains('is-open')) {
      setOpen(false);
    }
  });

  clearBtn.addEventListener('click', function () {
    if (isResponding) return;
    history = [];
    removeStorage(sessionStore, storageKey);
    renderHistory();
  });

  sendBtn.addEventListener('click', function (event) {
    if (!isResponding) return;
    event.preventDefault();
    stopActiveResponse();
  });

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    if (isResponding) return;
    ask(input.value);
  });

  input.addEventListener('input', autoResizeInput);
  input.addEventListener('keydown', function (event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      if (isResponding) return;
      if (form.requestSubmit) form.requestSubmit();
      else sendBtn.click();
    }
  });

  promptBtns.forEach(function (button) {
    button.addEventListener('click', function () {
      if (isResponding) return;
      const prompt = button.getAttribute('data-assistant-prompt') || '';
      ask(prompt);
    });
  });

  setResponding(false);
  setOpen(false);
  setHidden(readStorage(localStore, hiddenStorageKey, 'false') === 'true', { persist: false });
  renderHistory();
  scheduleSummaryCopyAvoidance();
})();
