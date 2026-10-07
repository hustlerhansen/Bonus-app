import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'vite';

// Use the frontend's existing bundler; no DOM, browser session or API required.
const dir = new URL('../.cache/points-cache-test/', import.meta.url);
await build({
  configFile: false, logLevel: 'silent',
  build: { lib: { entry: new URL('./cache-entry.ts', import.meta.url).pathname, formats: ['es'], fileName: () => 'cache.mjs' },
    outDir: dir.pathname, minify: false, emptyOutDir: true },
});
const { QueryClient, updatePointsCaches } = await import(new URL('cache.mjs', dir).href);
const walletKey = id => [`/api/v2/admin/accounts/${id}/wallet`];
const historyKey = (id, params = { limit: 20 }) => [`/api/v2/admin/accounts/${id}/transactions`, params];
const wallet = (id, amount) => ({ accountId: id, balance: amount, available: amount, reserved: 0, pending: 0, lifetimeEarned: 0, lifetimeRedeemed: 0 });
const tx = (id, sequence, status = 'approved') => ({ id, sequence: String(sequence), accountId: 'target', status });
const result = (transaction, amount) => ({ transaction, wallet: wallet('target', amount), replayed: false });
function client() { return new QueryClient({ defaultOptions: { queries: { retry: false } } }); }

test('committed wallet/refund history are immediately visible, including own wallet', async () => {
  const qc = client(), ownWallet = ['/api/v2/wallet'], ownHistory = ['/api/v2/transactions', { limit: 20 }];
  qc.setQueryData(ownWallet, wallet('target', 70));
  qc.setQueryData(walletKey('target'), wallet('target', 70));
  const old = { items: [tx('debit', 2), tx('credit', 1)], nextCursor: null };
  qc.setQueryData(historyKey('target'), old);
  qc.setQueryData(ownHistory, old);
  await updatePointsCaches(qc, result(tx('refund', 3), 100));
  assert.equal(qc.getQueryData(ownWallet).balance, 100);
  assert.equal(qc.getQueryData(walletKey('target')).balance, 100);
  assert.deepEqual(qc.getQueryData(historyKey('target')).items.map(t => t.id), ['refund', 'debit', 'credit']);
  assert.deepEqual(qc.getQueryData(ownHistory).items.map(t => t.id), ['refund', 'debit', 'credit']);
  qc.clear();
});
test('admin update cannot overwrite another account own wallet/history', async () => {
  const qc = client(), ownWallet = ['/api/v2/wallet'], ownHistory = ['/api/v2/transactions', { limit: 20 }];
  qc.setQueryData(ownWallet, wallet('other', 55));
  qc.setQueryData(ownHistory, { items: [tx('other-entry', 1)], nextCursor: null });
  await updatePointsCaches(qc, result(tx('adjustment', 2), 100));
  assert.equal(qc.getQueryData(ownWallet).accountId, 'other');
  assert.equal(qc.getQueryData(ownWallet).balance, 55);
  assert.deepEqual(qc.getQueryData(ownHistory).items.map(t => t.id), ['other-entry']);
  assert.equal(qc.getQueryData(walletKey('target')).balance, 100);
  qc.clear();
});
test('decision patches paged entries; new transaction goes only on page one with bounded cursor', async () => {
  const qc = client(), first = historyKey('target', { limit: 2 }), second = historyKey('target', { limit: 2, cursor: '2' });
  qc.setQueryData(first, { items: [tx('three', 3), tx('two', 2)], nextCursor: '2' });
  qc.setQueryData(second, { items: [tx('one', 1, 'pending')], nextCursor: null });
  await updatePointsCaches(qc, result(tx('one', 1, 'rejected'), 100));
  assert.equal(qc.getQueryData(second).items[0].status, 'rejected');
  assert.equal(qc.getQueryData(first).items.length, 2);
  await updatePointsCaches(qc, result(tx('four', 4), 101));
  assert.deepEqual(qc.getQueryData(first).items.map(t => t.id), ['four', 'three']);
  assert.equal(qc.getQueryData(first).nextCursor, '3');
  assert.deepEqual(qc.getQueryData(second).items.map(t => t.id), ['one']);
  qc.clear();
});
test('an older in-flight read cannot restore a pre-mutation wallet balance', async () => {
  const qc = client(), key = walletKey('target');
  let resolveOld;
  const old = qc.fetchQuery({ queryKey: key, queryFn: () => new Promise(resolve => { resolveOld = resolve; }) }).catch(() => null);
  await updatePointsCaches(qc, result(tx('latest', 5), 100));
  resolveOld(wallet('target', 70));
  await old;
  assert.equal(qc.getQueryData(key).balance, 100);
  qc.clear();
});
