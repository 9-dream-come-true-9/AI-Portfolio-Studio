const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const startup = fs.readFileSync(path.join(root, 'startup.js'), 'utf8');

assert(html.includes('startup.js?v=initial-scroll-1'), 'Startup logic must load before the document body');

function runStartup(navigationType, hash) {
  const handlers = {};
  const animationFrames = [];
  const scrollCalls = [];
  const document = { documentElement: { dataset: {} } };
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
    scrollTo: function (x, y) {
      scrollCalls.push([x, y]);
    }
  };
  const performance = {
    now: function () { return 12.5; },
    getEntriesByType: function () { return [{ type: navigationType }]; }
  };

  vm.runInNewContext(startup, { document, performance, window });
  return { animationFrames, document, handlers, history, scrollCalls };
}

const directEntry = runStartup('navigate', '');
assert.strictEqual(directEntry.document.documentElement.dataset.preloaderStartedAt, '12.5');
assert.strictEqual(directEntry.history.scrollRestoration, 'manual');
assert(directEntry.handlers.pageshow, 'Fresh root navigation must schedule a top reset after page show');
assert.strictEqual(directEntry.handlers.pageshow.options.once, true);
directEntry.handlers.pageshow.callback();
assert.deepStrictEqual(directEntry.scrollCalls, [[0, 0]]);
assert.strictEqual(directEntry.animationFrames.length, 1);
directEntry.animationFrames[0]();
assert.strictEqual(directEntry.history.scrollRestoration, 'auto');

const anchoredEntry = runStartup('navigate', '#projects');
assert.strictEqual(anchoredEntry.history.scrollRestoration, 'auto', 'Explicit section links must keep browser anchor behavior');
assert.strictEqual(anchoredEntry.handlers.pageshow, undefined);

const historyTraversal = runStartup('back_forward', '');
assert.strictEqual(historyTraversal.history.scrollRestoration, 'auto', 'Back and forward navigation must retain native scroll restoration');
assert.strictEqual(historyTraversal.handlers.pageshow, undefined);

console.log('Initial root navigation resets to the homepage while anchors and history traversal stay intact.');
