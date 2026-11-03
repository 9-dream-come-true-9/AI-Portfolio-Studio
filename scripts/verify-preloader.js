const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const preloader = fs.readFileSync(path.join(root, 'preloader.js'), 'utf8');

assert(html.includes('id="site-preloader"'), 'The site preloader markup must remain present');
assert(html.includes('preloader.js?v=preloader-5s-3'), 'Preloader cache token must invalidate the smooth-start fix');
assert(html.includes('startup.js?v=initial-scroll-3'), 'Startup script must run before parsing the page body');
assert(html.includes('animation: sitePreloaderProgress 5s linear forwards;'), 'Critical CSS must start the progress animation immediately');
assert(preloader.includes('const fixedDuration = 5000;'), 'The preloader must keep its five-second duration');
assert(preloader.includes('const recordedStartTime = Number(root.dataset.preloaderStartedAt);'), 'JavaScript must reuse the CSS animation start timestamp');
assert(!preloader.includes("progressFill.style.animation = 'none'"), 'JavaScript must not reset the progress animation');

console.log('Preloader single-clock and five-second duration checks passed.');
