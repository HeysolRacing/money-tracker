import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap, type Schemas } from '../../api/client';

// Grid, terms and dashboard share one root key, so any change refreshes all of them.
export const investmentKeys = {
  all: ['investments'] as const,
  grid: (year: number) => [...investmentKeys.all, 'grid', year] as const,
  dashboard: () => [...investmentKeys.all, 'dashboard'] as const,
  terms: (investmentId: number) => [...investmentKeys.all, 'terms', investmentId] as const,
};

function useInvalidateInvestments() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: investmentKeys.all });
}

export function useInvestmentGrid(year: number) {
  return useQuery({
    queryKey: investmentKeys.grid(year),
    queryFn: () => unwrap(api.GET('/api/investments', { params: { query: { year } } })),
    placeholderData: keepPreviousData,
  });
}

export function useInvestmentDashboard() {
  return useQuery({
    queryKey: investmentKeys.dashboard(),
    queryFn: () => unwrap(api.GET('/api/investments/dashboard')),
  });
}

export function useSaveInvestment() {
  const onSuccess = useInvalidateInvestments();
  return useMutation({
    mutationFn: ({ id, body }: { id?: number; body: Schemas['InvestmentCreate'] }) =>
      id
        ? unwrap(
            api.PATCH('/api/investments/{investment_id}', {
              params: { path: { investment_id: id } },
              body,
            }),
          )
        : unwrap(api.POST('/api/investments', { body })),
    onSuccess,
  });
}

export function useDeleteInvestment() {
  const onSuccess = useInvalidateInvestments();
  return useMutation({
    mutationFn: (id: number) =>
      unwrap(
        api.DELETE('/api/investments/{investment_id}', {
          params: { path: { investment_id: id } },
        }),
      ),
    onSuccess,
  });
}

export function useSetBalance() {
  const onSuccess = useInvalidateInvestments();
  return useMutation({
    mutationFn: (v: { investmentId: number; year: number; month: number; amount: string | null }) =>
      unwrap(
        api.PUT('/api/investments/{investment_id}/balances/{year}/{month}', {
          params: { path: { investment_id: v.investmentId, year: v.year, month: v.month } },
          body: { amount: v.amount },
        }),
      ),
    onSuccess,
  });
}

export function useTerms(investmentId: number | undefined) {
  return useQuery({
    queryKey: investmentKeys.terms(investmentId ?? 0),
    queryFn: () =>
      unwrap(
        api.GET('/api/investments/{investment_id}/terms', {
          params: { path: { investment_id: investmentId! } },
        }),
      ),
    enabled: investmentId !== undefined,
  });
}

export function useSaveTerm() {
  const onSuccess = useInvalidateInvestments();
  return useMutation({
    mutationFn: ({
      id,
      investmentId,
      body,
    }: {
      id?: number;
      investmentId: number;
      body: Schemas['TermCreate'];
    }) =>
      id
        ? unwrap(
            api.PATCH('/api/investments/terms/{term_id}', {
              params: { path: { term_id: id } },
              body,
            }),
          )
        : unwrap(
            api.POST('/api/investments/{investment_id}/terms', {
              params: { path: { investment_id: investmentId } },
              body,
            }),
          ),
    onSuccess,
  });
}

export function useDeleteTerm() {
  const onSuccess = useInvalidateInvestments();
  return useMutation({
    mutationFn: (id: number) =>
      unwrap(api.DELETE('/api/investments/terms/{term_id}', { params: { path: { term_id: id } } })),
    onSuccess,
  });
}
