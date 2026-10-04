import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap, type Schemas } from '../../api/client';

export const accountKeys = {
  all: ['accounts'] as const,
  list: (includeArchived: boolean) => [...accountKeys.all, { includeArchived }] as const,
};

export function useAccounts(includeArchived = false) {
  return useQuery({
    queryKey: accountKeys.list(includeArchived),
    queryFn: () =>
      unwrap(
        api.GET('/api/accounts', { params: { query: { include_archived: includeArchived } } }),
      ),
  });
}

export function useSaveAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id?: number; body: Schemas['AccountCreate'] }) =>
      id
        ? unwrap(
            api.PATCH('/api/accounts/{account_id}', { params: { path: { account_id: id } }, body }),
          )
        : unwrap(api.POST('/api/accounts', { body })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: accountKeys.all }),
  });
}

export function useArchiveAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, archived }: { id: number; archived: boolean }) =>
      unwrap(
        api.PATCH('/api/accounts/{account_id}', {
          params: { path: { account_id: id } },
          body: { is_archived: archived },
        }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: accountKeys.all }),
  });
}

export function useDeleteAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      unwrap(api.DELETE('/api/accounts/{account_id}', { params: { path: { account_id: id } } })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: accountKeys.all }),
  });
}
