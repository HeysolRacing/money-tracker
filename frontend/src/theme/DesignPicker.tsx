import { Box, Button, Group, Menu, Stack, Text } from '@mantine/core';
import { IconCheck, IconPalette } from '@tabler/icons-react';
import { DESIGNS, type Design } from './designs';
import { useDesign } from './DesignProvider';

function Swatch({ colors }: { colors: Design['swatch'] }) {
  return (
    <Group gap={0} wrap="nowrap" style={{ borderRadius: 6, overflow: 'hidden', flexShrink: 0 }}>
      {colors.map((color) => (
        <Box key={color} w={14} h={28} bg={color} />
      ))}
    </Group>
  );
}

/** Header dropdown to switch between the app's visual designs. */
export function DesignPicker() {
  const { design, setDesign } = useDesign();

  return (
    <Menu position="bottom-end" width={300} withinPortal>
      <Menu.Target>
        <Button
          variant="default"
          size="xs"
          leftSection={<IconPalette size={16} />}
          aria-label="Cambiar diseño"
        >
          {design.label}
        </Button>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>Diseño</Menu.Label>
        {DESIGNS.map((d) => (
          <Menu.Item
            key={d.id}
            onClick={() => setDesign(d.id)}
            leftSection={<Swatch colors={d.swatch} />}
            rightSection={d.id === design.id ? <IconCheck size={16} /> : null}
          >
            <Stack gap={0}>
              <Text size="sm" fw={600}>
                {d.label}
              </Text>
              <Text size="xs" c="dimmed">
                {d.description}
              </Text>
            </Stack>
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}
