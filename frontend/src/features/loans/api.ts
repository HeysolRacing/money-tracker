import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap, type Schemas } from '../../api/client';
import type { paths } from '../../api/schema';

export type LoanFilters = NonNullable<paths['/api/loans']['get']['parameters']['query']>;

// Entries and borrower totals share one root key, so any change refreshes both.
export const loanKeys = {
  all: ['loans'] as const,
  borrowers: () => [...loanKeys.all, 'borrowers'] as const,
  list: (filters: LoanFilters) => [...loanKeys.all, 'entries', filters] as const,
};

export function useBorrowers() {
  return useQuery({
    queryKey: loanKeys.borrowers(),
    queryFn: () => unwrap(api.GET('/api/loans/borrowers')),
  });
}

export function useLoanEntries(filters: LoanFilters) {
  return useQuery({
    queryKey: loanKeys.list(filters),
    queryFn: () => unwrap(api.GET('/api/loans', { params: { query: filters } })),
    placeholderData: keepPreviousData,
  });
}

export function useSaveBorrower() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id?: number; body: Schemas['BorrowerCreate'] }) =>
      id
        ? unwrap(
            api.PATCH('/api/loans/borrowers/{borrower_id}', {
              params: { path: { borrower_id: id } },
              body,
            }),
          )
        : unwrap(api.POST('/api/loans/borrowers', { body })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: loanKeys.all }),
  });
}

export function useDeleteBorrower() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      unwrap(
        api.DELETE('/api/loans/borrowers/{borrower_id}', {
          params: { path: { borrower_id: id } },
        }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: loanKeys.all }),
  });
}

export function useSaveLoanEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id?: number; body: Schemas['LoanEntryCreate'] }) =>
      id
        ? unwrap(api.PATCH('/api/loans/{entry_id}', { params: { path: { entry_id: id } }, body }))
        : unwrap(api.POST('/api/loans', { body })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: loanKeys.all }),
  });
}

export function useDeleteLoanEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      unwrap(api.DELETE('/api/loans/{entry_id}', { params: { path: { entry_id: id } } })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: loanKeys.all }),
  });
}
