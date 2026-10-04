import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap, type Schemas } from '../../api/client';

export const categoryKeys = { all: ['categories'] as const };

export function useCategories() {
  return useQuery({
    queryKey: categoryKeys.all,
    queryFn: () => unwrap(api.GET('/api/categories')),
    staleTime: 5 * 60_000,
  });
}

export function useSaveCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id?: number; body: Schemas['CategoryCreate'] }) =>
      id
        ? unwrap(
            api.PATCH('/api/categories/{category_id}', {
              params: { path: { category_id: id } },
              body: { name: body.name, parent_id: body.parent_id, color: body.color },
            }),
          )
        : unwrap(api.POST('/api/categories', { body })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: categoryKeys.all }),
  });
}

export function useDeleteCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      unwrap(
        api.DELETE('/api/categories/{category_id}', { params: { path: { category_id: id } } }),
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: categoryKeys.all });
      // Transactions in a deleted category become uncategorized.
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
    },
  });
}

/** Label with parent prefix, e.g. "Alimentación › Supermercado". */
export function categoryLabel(category: Schemas['CategoryOut'], all: Schemas['CategoryOut'][]) {
  const parent = category.parent_id ? all.find((c) => c.id === category.parent_id) : undefined;
  return parent ? `${parent.name} › ${category.name}` : category.name;
}
