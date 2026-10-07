import type { QueryClient } from '@tanstack/react-query';
import {
  getGetV2AdminWalletQueryKey, getGetV2WalletQueryKey, getListV2AdminTransactionsQueryKey, getListV2TransactionsQueryKey,
  type V2PointsResult, type V2TransactionPage, type V2Wallet,
} from '@workspace/api-client-react';

// The committed mutation response is authoritative. Render it immediately,
// then reconcile every cached history page; do not rely solely on a refetch.
export async function updatePointsCaches(qc: QueryClient, result: V2PointsResult) {
  const accountId = result.wallet.accountId;
  const ownKey = getGetV2WalletQueryKey();
  const own = qc.getQueryData<V2Wallet>(ownKey)?.accountId === accountId;
  const walletKeys = [getGetV2AdminWalletQueryKey(accountId), ...(own ? [ownKey] : [])];
  const historyKeys = [getListV2AdminTransactionsQueryKey(accountId), ...(own ? [getListV2TransactionsQueryKey()] : [])];
  // An earlier in-flight read must not overwrite the newly committed result.
  await Promise.all([...walletKeys, ...historyKeys].map(queryKey => qc.cancelQueries({ queryKey })));
  for (const queryKey of walletKeys) qc.setQueryData(queryKey, result.wallet);
  for (const queryKey of historyKeys) {
    for (const query of qc.getQueryCache().findAll({ queryKey })) {
      const params = query.queryKey[1] as { cursor?: string; limit?: number } | undefined;
      qc.setQueryData<V2TransactionPage>(query.queryKey, page => {
        if (!page) return page;
        if (page.items.some(t => t.id === result.transaction.id)) {
          return { ...page, items: page.items.map(t => t.id === result.transaction.id ? result.transaction : t) };
        }
        if (params?.cursor || (page.items[0] && BigInt(result.transaction.sequence) <= BigInt(page.items[0].sequence))) return page;
        const limit = params?.limit ?? 20;
        const items = [result.transaction, ...page.items];
        const visible = items.slice(0, limit);
        return { items: visible, nextCursor: items.length > limit ? visible.at(-1)!.sequence : page.nextCursor };
      });
    }
  }
  await Promise.all([...walletKeys, ...historyKeys].map(queryKey => qc.invalidateQueries({ queryKey })));
}
