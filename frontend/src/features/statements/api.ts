import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap, type Schemas } from '../../api/client';
import { accountKeys } from '../accounts/api';
import { transactionKeys } from '../transactions/api';

export const statementKeys = {
  all: ['statement-imports'] as const,
  list: (accountId: number | null) => [...statementKeys.all, accountId] as const,
};

/** Reads the PDF on the server; nothing is saved. */
export function usePreviewStatement() {
  return useMutation({
    mutationFn: ({ accountId, file }: { accountId: number; file: File }) =>
      unwrap(
        api.POST('/api/statements/preview', {
          // The generated type says `string`; the file goes as multipart form data.
          body: { account_id: accountId, file: file as unknown as string },
          bodySerializer: (body) => {
            const form = new FormData();
            form.append('account_id', String(body.account_id));
            form.append('file', body.file as unknown as Blob);
            return form;
          },
        }),
      ),
  });
}

/** Loads and deletions change movements, balances and the list of loads. */
function useInvalidateStatements() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: statementKeys.all });
    queryClient.invalidateQueries({ queryKey: transactionKeys.all });
    queryClient.invalidateQueries({ queryKey: accountKeys.all });
  };
}

export function useImportStatement() {
  const invalidate = useInvalidateStatements();
  return useMutation({
    mutationFn: (body: Schemas['StatementImportCreate']) =>
      unwrap(api.POST('/api/statements/import', { body })),
    onSuccess: invalidate,
  });
}

/** Statements already loaded into an account. */
export function useStatementImports(accountId: number | null) {
  return useQuery({
    queryKey: statementKeys.list(accountId),
    queryFn: () =>
      unwrap(api.GET('/api/statements/imports', { params: { query: { account_id: accountId } } })),
    enabled: accountId !== null,
  });
}

/** Deletes a load and the movements it created. */
export function useDeleteStatementImport() {
  const invalidate = useInvalidateStatements();
  return useMutation({
    mutationFn: (id: number) =>
      unwrap(
        api.DELETE('/api/statements/imports/{import_id}', {
          params: { path: { import_id: id } },
        }),
      ),
    onSuccess: invalidate,
  });
}
