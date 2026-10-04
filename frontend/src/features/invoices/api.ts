import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap, type Schemas } from '../../api/client';
import type { paths } from '../../api/schema';

export type InvoiceFilters = NonNullable<paths['/api/invoices']['get']['parameters']['query']>;

export const invoiceKeys = {
  all: ['invoices'] as const,
  list: (filters: InvoiceFilters) => [...invoiceKeys.all, filters] as const,
};

export function useInvoices(filters: InvoiceFilters) {
  return useQuery({
    queryKey: invoiceKeys.list(filters),
    queryFn: () => unwrap(api.GET('/api/invoices', { params: { query: filters } })),
    placeholderData: keepPreviousData,
  });
}

export function useSaveInvoice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id?: number; body: Schemas['InvoiceUpdate'] }) =>
      id
        ? unwrap(
            api.PATCH('/api/invoices/{invoice_id}', {
              params: { path: { invoice_id: id } },
              body,
            }),
          )
        : unwrap(api.POST('/api/invoices', { body: body as Schemas['InvoiceCreate'] })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: invoiceKeys.all }),
  });
}

export function useDeleteInvoice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      unwrap(api.DELETE('/api/invoices/{invoice_id}', { params: { path: { invoice_id: id } } })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: invoiceKeys.all }),
  });
}
