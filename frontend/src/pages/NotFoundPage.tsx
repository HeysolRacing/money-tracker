import { Anchor, Stack, Title } from '@mantine/core';
import { Link } from 'react-router';

export function NotFoundPage() {
  return (
    <Stack>
      <Title order={2}>Página no encontrada</Title>
      <Anchor component={Link} to="/">
        Volver al inicio
      </Anchor>
    </Stack>
  );
}
