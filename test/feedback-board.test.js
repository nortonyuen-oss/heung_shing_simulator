const test = require('node:test');
const assert = require('node:assert/strict');
const { preparePost, listUrl, issueUrl, publicIssues } = require('../docs/feedback.js');

test('a visitor post preserves Unicode and special characters without privileged label parameters', () => {
  const post = preparePost({ type: 'bug', title: '存檔 & 載入 #問題', version: '4.9.0', platform: 'Windows', details: '第一行\n<img src=x onerror=alert(1)>\n?x=1&y=2' });
  const url = new URL(post.url);
  assert.equal(url.origin, 'https://github.com');
  assert.equal(url.pathname, '/nortonyuen-oss/heung_shing_simulator/issues/new');
  assert.equal(url.searchParams.get('template'), 'website-feedback.md');
  assert.equal(url.searchParams.get('title'), '[bug] 存檔 & 載入 #問題');
  assert.equal(url.searchParams.get('body'), post.body);
  assert.ok(post.body.includes('第一行\n<img src=x onerror=alert(1)>\n?x=1&y=2'));
  assert.equal(url.searchParams.has('labels'), false);
  assert.equal(post.copyRequired, false);
});

test('long multilingual posts offer a complete copy instead of an oversized or truncated URL', () => {
  const details = '詳細情況'.repeat(1200);
  const post = preparePost({ title: 'Long report', details, type: 'question' });
  assert.equal(post.copyRequired, true);
  assert.equal(new URL(post.url).searchParams.has('body'), false);
  assert.ok(post.body.includes(details));
  assert.ok(post.url.length < 7000);
});

test('the feed always filters website messages and validates pagination', () => {
  const url = new URL(listUrl('closed', 3));
  assert.equal(url.searchParams.get('labels'), 'website-feedback');
  assert.equal(url.searchParams.get('state'), 'closed');
  assert.equal(url.searchParams.get('page'), '3');
  assert.throws(() => listUrl('invalid', 1));
  assert.throws(() => listUrl('all', -1));
  assert.equal(issueUrl(12), 'https://github.com/nortonyuen-oss/heung_shing_simulator/issues/12');
  assert.throws(() => issueUrl('javascript:alert(1)'));
});

test('pull requests and malformed issue records are excluded from the board', () => {
  assert.deepEqual(publicIssues([{ number: 1 }, { number: 2, pull_request: {} }, null, { number: '3' }, { number: -1 }]), [{ number: 1 }]);
  assert.throws(() => publicIssues({ message: 'API error' }));
});
