import { AppShell, Burger, Button, Group, NavLink, Text, Title } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconCategory, IconFileInvoice, IconHome, IconList, IconWallet } from '@tabler/icons-react';
import { NavLink as RouterNavLink, Outlet } from 'react-router';
import { useLogout, useMe } from '../features/auth/useAuth';
import { DesignPicker } from '../theme/DesignPicker';

// Sections are added here as each phase lands.
const NAV_ITEMS = [
  { to: '/', label: 'Inicio', icon: IconHome, end: true },
  { to: '/movimientos', label: 'Movimientos', icon: IconList },
  { to: '/facturas', label: 'Facturas', icon: IconFileInvoice },
  { to: '/cuentas', label: 'Cuentas', icon: IconWallet },
  { to: '/categorias', label: 'Categorías', icon: IconCategory },
];

export function Layout() {
  const [opened, { toggle, close }] = useDisclosure();
  const { data: user } = useMe();
  const logout = useLogout();

  return (
    <AppShell
      header={{ height: 56 }}
      navbar={{ width: 220, breakpoint: 'sm', collapsed: { mobile: !opened } }}
      padding="md"
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group>
            <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
            <Title order={4}>MoneyTracker</Title>
          </Group>
          <Group gap="sm">
            <Text size="sm" c="dimmed" visibleFrom="sm">
              {user?.email}
            </Text>
            <DesignPicker />
            <Button variant="subtle" size="xs" onClick={() => logout.mutate()}>
              Cerrar sesión
            </Button>
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="xs">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            component={RouterNavLink}
            to={item.to}
            end={item.end}
            label={item.label}
            leftSection={<item.icon size={18} stroke={1.6} />}
            onClick={close}
          />
        ))}
      </AppShell.Navbar>

      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  );
}
