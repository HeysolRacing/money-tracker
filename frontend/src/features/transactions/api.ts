import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap, type Schemas } from '../../api/client';
import type { paths } from '../../api/schema';
import { accountKeys } from '../accounts/api';

export type TransactionFilters = NonNullable<
  paths['/api/transactions']['get']['parameters']['query']
>;

export const transactionKeys = {
  all: ['transactions'] as const,
  list: (filters: TransactionFilters) => [...transactionKeys.all, filters] as const,
};

export function useTransactions(filters: TransactionFilters) {
  return useQuery({
    queryKey: transactionKeys.list(filters),
    queryFn: () => unwrap(api.GET('/api/transactions', { params: { query: filters } })),
    placeholderData: keepPreviousData,
  });
}

/** Transactions change account balances, so both caches are refreshed. */
function useInvalidateLedger() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: transactionKeys.all });
    queryClient.invalidateQueries({ queryKey: accountKeys.all });
  };
}

export function useSaveTransaction() {
  const invalidate = useInvalidateLedger();
  return useMutation({
    mutationFn: ({ id, body }: { id?: number; body: Schemas['TransactionCreate'] }) =>
      id
        ? unwrap(
            api.PATCH('/api/transactions/{transaction_id}', {
              params: { path: { transaction_id: id } },
              body,
            }),
          )
        : unwrap(api.POST('/api/transactions', { body })),
    onSuccess: invalidate,
  });
}

/** Transfers only allow editing shared fields (date, description, notes). */
export function useUpdateTransfer() {
  const invalidate = useInvalidateLedger();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: Schemas['TransactionUpdate'] }) =>
      unwrap(
        api.PATCH('/api/transactions/{transaction_id}', {
          params: { path: { transaction_id: id } },
          body,
        }),
      ),
    onSuccess: invalidate,
  });
}

export function useCreateTransfer() {
  const invalidate = useInvalidateLedger();
  return useMutation({
    mutationFn: (body: Schemas['TransferCreate']) => unwrap(api.POST('/api/transfers', { body })),
    onSuccess: invalidate,
  });
}

export function useDeleteTransaction() {
  const invalidate = useInvalidateLedger();
  return useMutation({
    mutationFn: (id: number) =>
      unwrap(
        api.DELETE('/api/transactions/{transaction_id}', {
          params: { path: { transaction_id: id } },
        }),
      ),
    onSuccess: invalidate,
  });
}
