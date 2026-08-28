import { Group, Switch } from '@mantine/core';
import { IconDeviceDesktop, IconDeviceMobile, IconDeviceTablet } from '@tabler/icons-react';

export interface ResponsiveVisibilityValue {
  hideDesktop?: boolean;
  hideTablet?: boolean;
  hideMobile?: boolean;
}

interface ResponsiveVisibilityControlsProps {
  value: ResponsiveVisibilityValue;
  onChange: (value: ResponsiveVisibilityValue) => void;
}

/** Controlli di visibilita per i tre breakpoint del blocco selezionato. */
export default function ResponsiveVisibilityControls({
  value,
  onChange,
}: ResponsiveVisibilityControlsProps): JSX.Element {
  return (
    <Group gap="sm" wrap="wrap">
      <Switch
        label="Nascondi su Desktop"
        checked={value.hideDesktop === true}
        onChange={(event) => onChange({ ...value, hideDesktop: event.currentTarget.checked })}
        onLabel={<IconDeviceDesktop size={14} aria-hidden />}
        offLabel={<IconDeviceDesktop size={14} aria-hidden />}
      />
      <Switch
        label="Nascondi su Tablet"
        checked={value.hideTablet === true}
        onChange={(event) => onChange({ ...value, hideTablet: event.currentTarget.checked })}
        onLabel={<IconDeviceTablet size={14} aria-hidden />}
        offLabel={<IconDeviceTablet size={14} aria-hidden />}
      />
      <Switch
        label="Nascondi su Mobile"
        checked={value.hideMobile === true}
        onChange={(event) => onChange({ ...value, hideMobile: event.currentTarget.checked })}
        onLabel={<IconDeviceMobile size={14} aria-hidden />}
        offLabel={<IconDeviceMobile size={14} aria-hidden />}
      />
    </Group>
  );
}
