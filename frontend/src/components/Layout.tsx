import {
  ActionIcon,
  AppShell,
  Burger,
  Button,
  Group,
  NavLink,
  ScrollArea,
  Text,
  Title,
  Tooltip,
} from '@mantine/core';
import { useDisclosure, useLocalStorage, useMediaQuery } from '@mantine/hooks';
import {
  IconCash,
  IconCategory,
  IconFileInvoice,
  IconHome,
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
  IconList,
  IconTrendingUp,
  IconWallet,
} from '@tabler/icons-react';
import { NavLink as RouterNavLink, Outlet } from 'react-router';
import { useLogout, useMe } from '../features/auth/useAuth';
import { DesignPicker } from '../theme/DesignPicker';

// Sections are added here as each phase lands.
const NAV_ITEMS = [
  { to: '/', label: 'Inicio', icon: IconHome, end: true },
  { to: '/movimientos', label: 'Movimientos', icon: IconList },
  { to: '/facturas', label: 'Facturas', icon: IconFileInvoice },
  { to: '/prestamos', label: 'Préstamos', icon: IconCash },
  { to: '/inversiones', label: 'Inversiones', icon: IconTrendingUp },
  { to: '/cuentas', label: 'Cuentas', icon: IconWallet },
  { to: '/categorias', label: 'Categorías', icon: IconCategory },
];

const NAVBAR_WIDTH = 220;
const RAIL_WIDTH = 64;

export function Layout() {
  const [opened, { toggle, close }] = useDisclosure();
  // Desktop only: the sidebar can shrink to an icon rail. Remembered per browser.
  const [collapsed, setCollapsed] = useLocalStorage({
    key: 'mt-navbar-collapsed',
    defaultValue: false,
  });
  // On phones the sidebar is a drawer opened from the burger, always with labels.
  const isMobile = useMediaQuery('(max-width: 48em)');
  const rail = collapsed && !isMobile;
  const { data: user } = useMe();
  const logout = useLogout();

  return (
    <AppShell
      header={{ height: 56 }}
      navbar={{
        width: { base: NAVBAR_WIDTH, sm: rail ? RAIL_WIDTH : NAVBAR_WIDTH },
        breakpoint: 'sm',
        collapsed: { mobile: !opened },
      }}
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
        <AppShell.Section grow component={ScrollArea} scrollbars="y">
          {NAV_ITEMS.map((item) => (
            <Tooltip key={item.to} label={item.label} position="right" disabled={!rail}>
              <NavLink
                component={RouterNavLink}
                to={item.to}
                end={item.end}
                label={rail ? undefined : item.label}
                aria-label={item.label}
                leftSection={<item.icon size={18} stroke={1.6} />}
                onClick={close}
                styles={
                  rail ? { section: { marginInlineEnd: 0 }, body: { display: 'none' } } : undefined
                }
                style={rail ? { justifyContent: 'center' } : undefined}
              />
            </Tooltip>
          ))}
        </AppShell.Section>
        <AppShell.Section visibleFrom="sm" pt="xs">
          <Group justify={rail ? 'center' : 'flex-end'}>
            <Tooltip label={rail ? 'Expandir menú' : 'Contraer menú'} position="right">
              <ActionIcon
                variant="subtle"
                color="gray"
                size="lg"
                aria-label={rail ? 'Expandir menú' : 'Contraer menú'}
                aria-expanded={!rail}
                onClick={() => setCollapsed((c) => !c)}
              >
                {rail ? (
                  <IconLayoutSidebarLeftExpand size={20} stroke={1.6} />
                ) : (
                  <IconLayoutSidebarLeftCollapse size={20} stroke={1.6} />
                )}
              </ActionIcon>
            </Tooltip>
          </Group>
        </AppShell.Section>
      </AppShell.Navbar>

      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  );
}
