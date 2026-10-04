import {
  Alert,
  Button,
  Center,
  Paper,
  PasswordInput,
  Stack,
  TextInput,
  Title,
} from '@mantine/core';
import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { useLogin, useMe } from '../features/auth/useAuth';

export function LoginPage() {
  const { data: user } = useMe();
  const login = useLogin();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const from = (location.state as { from?: string } | null)?.from ?? '/';
  if (user) return <Navigate to={from} replace />;

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    login.mutate({ email, password }, { onSuccess: () => navigate(from, { replace: true }) });
  }

  return (
    <Center h="100vh" bg="var(--mantine-color-body)">
      <Paper withBorder shadow="sm" p="xl" radius="md" w={360} maw="calc(100vw - 32px)">
        <form onSubmit={handleSubmit}>
          <Stack>
            <Title order={2} ta="center">
              MoneyTracker
            </Title>
            {login.error && <Alert color="red">{login.error.message}</Alert>}
            <TextInput
              label="Correo"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.currentTarget.value)}
              required
            />
            <PasswordInput
              label="Contraseña"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.currentTarget.value)}
              required
            />
            <Button type="submit" loading={login.isPending}>
              Iniciar sesión
            </Button>
          </Stack>
        </form>
      </Paper>
    </Center>
  );
}
