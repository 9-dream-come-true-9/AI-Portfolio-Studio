const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const startup = fs.readFileSync(path.join(root, 'startup.js'), 'utf8');

assert(html.includes('startup.js?v=initial-scroll-3'), 'Startup logic must load before the document body');

function runStartup(navigationType, hash) {
  const handlers = {};
  const animationFrames = [];
  const scrollCalls = [];
  const anchorCalls = [];
  const document = {
    documentElement: { dataset: {}, style: { scrollBehavior: '' } },
    getElementById: function (id) {
      return { scrollIntoView: function (options) { anchorCalls.push({ id, behavior: options.behavior }); } };
    },
    addEventListener: function (name, callback, options) {
      handlers[name] = { callback, options };
    }
  };
  const history = { scrollRestoration: 'auto' };
  const window = {
    history,
    location: { hash },
    addEventListener: function (name, callback, options) {
      handlers[name] = { callback, options };
    },
    requestAnimationFrame: function (callback) {
      animationFrames.push(callback);
    },
    scrollTo: function (options) {
      scrollCalls.push({ top: options.top, left: options.left, behavior: options.behavior });
    }
  };
  const performance = {
    now: function () { return 12.5; },
    getEntriesByType: function () { return [{ type: navigationType }]; }
  };

  vm.runInNewContext(startup, { document, performance, window });
  return { anchorCalls, animationFrames, document, handlers, history, scrollCalls };
}

const directEntry = runStartup('navigate', '');
assert.strictEqual(directEntry.document.documentElement.dataset.preloaderStartedAt, '12.5');
assert.strictEqual(directEntry.history.scrollRestoration, 'manual');
assert.strictEqual(directEntry.document.documentElement.style.scrollBehavior, 'auto');
assert(directEntry.handlers.pageshow, 'Fresh root navigation must schedule a top reset after page show');
assert.strictEqual(directEntry.handlers.pageshow.options.once, true);
assert(directEntry.handlers['site:ready'], 'Top reset must also run when the preloader reveals the page');
directEntry.handlers.pageshow.callback();
assert.deepStrictEqual(directEntry.scrollCalls, [{ top: 0, left: 0, behavior: 'instant' }]);
assert.strictEqual(directEntry.history.scrollRestoration, 'manual');
directEntry.handlers['site:ready'].callback();
assert.deepStrictEqual(directEntry.scrollCalls, [
  { top: 0, left: 0, behavior: 'instant' },
  { top: 0, left: 0, behavior: 'instant' }
]);
assert.strictEqual(directEntry.animationFrames.length, 1);
directEntry.animationFrames[0]();
assert.strictEqual(directEntry.history.scrollRestoration, 'manual');
directEntry.animationFrames[1]();
assert.strictEqual(directEntry.history.scrollRestoration, 'auto');
assert.strictEqual(directEntry.document.documentElement.style.scrollBehavior, '');

const reload = runStartup('reload', '');
assert.strictEqual(reload.history.scrollRestoration, 'manual', 'Reloading the root must not restore a previous section');
reload.handlers.pageshow.callback();
reload.handlers['site:ready'].callback();
assert.strictEqual(reload.scrollCalls.length, 2);

const earlyReveal = runStartup('navigate', '');
earlyReveal.handlers['site:ready'].callback();
assert.strictEqual(earlyReveal.animationFrames.length, 0);
earlyReveal.handlers.pageshow.callback();
assert.strictEqual(earlyReveal.scrollCalls.length, 2);
earlyReveal.animationFrames[0]();
earlyReveal.animationFrames[1]();
assert.strictEqual(earlyReveal.history.scrollRestoration, 'auto');

const anchoredEntry = runStartup('navigate', '#projects');
assert.strictEqual(anchoredEntry.history.scrollRestoration, 'auto', 'Explicit section links must keep browser anchor behavior');
anchoredEntry.handlers.pageshow.callback();
anchoredEntry.handlers['site:ready'].callback();
assert.deepStrictEqual(anchoredEntry.anchorCalls, [
  { id: 'projects', behavior: 'instant' },
  { id: 'projects', behavior: 'instant' }
]);

const historyTraversal = runStartup('back_forward', '');
assert.strictEqual(historyTraversal.history.scrollRestoration, 'auto', 'Back and forward navigation must retain native scroll restoration');
assert.strictEqual(historyTraversal.handlers.pageshow, undefined);

console.log('Root navigation and reload reset to the homepage; direct anchors land after the preloader.');
