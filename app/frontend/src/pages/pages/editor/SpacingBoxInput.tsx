import { useState } from 'react';
import { ActionIcon, Group, NumberInput, Select, Stack, Text, Tooltip } from '@mantine/core';
import { IconLink, IconUnlink } from '@tabler/icons-react';
import styles from './SpacingBoxInput.module.css';

export interface SpacingBoxInputValue {
  top: number;
  right: number;
  bottom: number;
  left: number;
  unit: string;
}

export interface SpacingBoxInputProps {
  value: SpacingBoxInputValue;
  onChange: (value: SpacingBoxInputValue) => void;
  label: string;
}

const SIDES = [
  { key: 'top', label: 'Top' },
  { key: 'right', label: 'Right' },
  { key: 'bottom', label: 'Bottom' },
  { key: 'left', label: 'Left' },
] as const;

const UNIT_OPTIONS = [
  { value: 'px', label: 'px' },
  { value: 'rem', label: 'rem' },
  { value: '%', label: '%' },
];

export default function SpacingBoxInput({ value, onChange, label }: SpacingBoxInputProps): JSX.Element {
  const [linked, setLinked] = useState(false);

  function updateSide(side: (typeof SIDES)[number]['key'], next: number | string): void {
    const nextValue = typeof next === 'number' ? next : 0;
    onChange(
      linked
        ? { ...value, top: nextValue, right: nextValue, bottom: nextValue, left: nextValue }
        : { ...value, [side]: nextValue },
    );
  }

  return (
    <fieldset className={styles.root}>
      <legend className={styles.legend}>{label}</legend>
      <Stack gap="sm">
        <Group className={styles.controls} gap="xs" align="flex-end" wrap="nowrap">
          {SIDES.map(({ key, label: sideLabel }) => (
            <NumberInput
              key={key}
              label={sideLabel}
              aria-label={`${label} ${sideLabel}`}
              min={0}
              value={value[key]}
              onChange={(next) => updateSide(key, next)}
            />
          ))}
          <Tooltip
            label={linked ? 'Sblocca i lati' : 'Collega i lati'}
            withArrow
          >
            <ActionIcon
              className={styles.linkButton}
              variant={linked ? 'light' : 'subtle'}
              color={linked ? 'blue' : 'gray'}
              aria-label={linked ? 'Sblocca i lati' : 'Collega i lati'}
              aria-pressed={linked}
              onClick={() => setLinked((current) => !current)}
            >
              {linked ? <IconLink size={16} aria-hidden /> : <IconUnlink size={16} aria-hidden />}
            </ActionIcon>
          </Tooltip>
        </Group>
        <Select
          label="Unità"
          aria-label={`${label} Unità`}
          data={UNIT_OPTIONS}
          value={value.unit}
          allowDeselect={false}
          onChange={(unit) => {
            if (unit !== null) onChange({ ...value, unit });
          }}
        />
        <Text className={styles.hint} size="xs" c="dimmed">
          I valori sono espressi nell&apos;unità selezionata.
        </Text>
      </Stack>
    </fieldset>
  );
}