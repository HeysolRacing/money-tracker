import { Center, Loader } from '@mantine/core';
import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useMe } from './useAuth';

export function RequireAuth({ children }: { children: ReactNode }) {
  const { data: user, isPending } = useMe();
  const location = useLocation();

  if (isPending) {
    return (
      <Center h="100vh">
        <Loader />
      </Center>
    );
  }
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return children;
}
