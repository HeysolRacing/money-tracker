import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiRequestError, unwrap } from '../../api/client';

export const authKeys = {
  me: ['auth', 'me'] as const,
};

/** Current user, or null when not logged in. */
export function useMe() {
  return useQuery({
    queryKey: authKeys.me,
    queryFn: async () => {
      try {
        return await unwrap(api.GET('/api/auth/me'));
      } catch (err) {
        if (err instanceof ApiRequestError && err.status === 401) return null;
        throw err;
      }
    },
    staleTime: Infinity,
  });
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { email: string; password: string }) =>
      unwrap(api.POST('/api/auth/login', { body })),
    onSuccess: (user) => queryClient.setQueryData(authKeys.me, user),
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => unwrap(api.POST('/api/auth/logout')),
    onSuccess: () => {
      queryClient.clear();
      queryClient.setQueryData(authKeys.me, null);
    },
  });
}
