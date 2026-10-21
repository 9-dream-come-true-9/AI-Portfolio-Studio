const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const script = fs.readFileSync(path.join(root, 'script.js'), 'utf8');
const api = require(path.join(root, 'api', 'chat.js'));

assert(
  /<textarea\b[^>]*data-assistant-input[^>]*maxlength="800"/.test(html),
  'Assistant input must prevent messages longer than the server limit'
);
assert.strictEqual(
  (html.match(/assistant-request-error-3/g) || []).length,
  1,
  'Request-error fix must invalidate the deployed assistant script cache'
);
assert.strictEqual(
  (html.match(/assistant-sse-thinking-status-3/g) || []).length,
  1,
  'SSE thinking-status fix must invalidate the deployed assistant script cache'
);
assert(script.includes('const maxQuestionLength = 800;'), 'Frontend and API message limits must stay aligned');
assert(script.includes("typeof errorPayload.message === 'string'"), 'Frontend must preserve the server user-facing error message');
assert(script.includes('const partialFailureNotice = hasServiceFailure'), 'Partial streamed failures must remain visibly marked as failures');
assert(script.includes("if (status === 408 || status === 504) return '';"), 'Timeouts must not become visible assistant copy');
assert(script.includes('eventName === \'status\''), 'Frontend must consume the initial SSE thinking-status event');
assert(script.includes('function applyStreamStatus(status)'), 'Frontend must render the initial SSE thinking status');
assert(script.includes('const thinkingStatusIntervalMs = 1400;'), 'Frontend must cycle thinking statuses locally while waiting for the first token');
assert(script.includes('function advanceLocalThinkingStatus()'), 'Frontend thinking-status cycle is missing');
assert(script.includes('stopLocalThinkingStatusLoop();'), 'Frontend thinking-status cycle must stop after the first answer delta');
assert(!script.includes('assistantNoContentTimeoutMs'), 'The 8-second no-content timeout must be removed');
assert(!script.includes('timedOutBeforeContent'), 'The fixed no-content timeout branch must be removed');
assert(script.includes("status === 413"), 'Frontend must distinguish oversized messages from service outages');
assert(script.includes("status === 504"), 'Frontend must distinguish upstream timeouts from generic failures');
assert(script.includes("问题请控制在 ' + maxQuestionLength + ' 个字符以内。"), 'Client-side oversized-message guard is missing');
assert.strictEqual(api.MAX_USER_MESSAGE_LENGTH, 800, 'API message limit must remain 800 characters');
assert.strictEqual(api.DEFAULT_UPSTREAM_TIMEOUT_MS, 45000, 'Hosted AI requests need enough time for slow but valid model responses');
assert(api.getUpstreamFailurePayload, 'API must expose a structured upstream failure payload');
assert.deepStrictEqual(api.getUpstreamFailurePayload(true), {
  error: 'AI request timed out',
  code: 'AI_REQUEST_TIMEOUT',
  message: ''
});
assert.deepStrictEqual(api.getUpstreamFailurePayload(false), {
  error: 'AI service unavailable',
  code: 'AI_SERVICE_UNAVAILABLE',
  message: 'AI 服务暂时不可用，请稍后再试。'
});

const helperStart = script.indexOf('  function getAssistantRequestErrorMessage(');
const helperEnd = script.indexOf('\n  async function callModel(', helperStart);
assert(helperStart !== -1 && helperEnd > helperStart, 'Unable to locate request error message helper');
const helperContext = {};
vm.runInNewContext(
  script.slice(helperStart, helperEnd) + '\nthis.getAssistantRequestErrorMessage = getAssistantRequestErrorMessage;',
  helperContext
);

const getMessage = helperContext.getAssistantRequestErrorMessage;
assert.strictEqual(
  getMessage({ status: 413, userMessage: '问题请控制在 800 个字符以内。' }),
  '问题请控制在 800 个字符以内。'
);
assert.strictEqual(getMessage({ status: 400 }), 'AI 服务暂时不可用，请稍后再试。');
assert.strictEqual(getMessage({ status: 400, code: 'AI request failed' }), 'AI 服务暂时不可用，请稍后再试。');
assert.strictEqual(getMessage({ status: 400, code: 'MISSING_MESSAGE' }), '请输入问题后再发送。');
assert.strictEqual(getMessage({ status: 429 }), '当前访问较多或额度已达到上限，请稍后再试。');
assert.strictEqual(
  getMessage({ status: 504, userMessage: 'AI 服务响应超时，请稍后再试。' }),
  ''
);
assert.strictEqual(getMessage({ status: 504 }), '');
assert.strictEqual(getMessage({ status: 502 }), 'AI 服务暂时不可用，请稍后再试。');

console.log('Assistant request-limit and service-error mapping checks passed.');
