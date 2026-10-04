import { Anchor, Card, Group, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { Link } from 'react-router';
import { useAccounts } from '../features/accounts/api';
import { formatMoney } from '../lib/money';

export function HomePage() {
  const { data: accounts } = useAccounts();

  return (
    <Stack>
      <Title order={2}>Inicio</Title>
      {accounts?.length === 0 ? (
        <Text>
          Empieza agregando tus{' '}
          <Anchor component={Link} to="/cuentas">
            cuentas y tarjetas
          </Anchor>
          .
        </Text>
      ) : (
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }}>
          {accounts?.map((a) => (
            <Card key={a.id} withBorder component={Link} to={`/movimientos?account_id=${a.id}`}>
              <Group justify="space-between">
                <Text size="sm" c="dimmed">
                  {a.name}
                </Text>
              </Group>
              <Text size="lg" fw={700} c={a.balance.startsWith('-') ? 'red' : undefined}>
                {formatMoney(a.balance, a.currency)}
              </Text>
            </Card>
          ))}
        </SimpleGrid>
      )}
    </Stack>
  );
}
