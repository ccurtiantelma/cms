import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import ResponsiveVisibilityControls from './ResponsiveVisibilityControls';

function renderControls(value = {}) {
  const onChange = vi.fn();
  render(
    <MantineProvider>
      <ResponsiveVisibilityControls value={value} onChange={onChange} />
    </MantineProvider>,
  );
  return onChange;
}

describe('ResponsiveVisibilityControls', () => {
  it('renders the three responsive switches with their current values', () => {
    renderControls({ hideDesktop: true, hideMobile: true });

    expect(screen.getByRole('switch', { name: 'Nascondi su Desktop' })).toBeChecked();
    expect(screen.getByRole('switch', { name: 'Nascondi su Tablet' })).not.toBeChecked();
    expect(screen.getByRole('switch', { name: 'Nascondi su Mobile' })).toBeChecked();
  });

  it('returns only the changed visibility value while preserving the others', () => {
    const onChange = renderControls({ hideDesktop: true });

    fireEvent.click(screen.getByRole('switch', { name: 'Nascondi su Tablet' }));

    expect(onChange).toHaveBeenCalledWith({ hideDesktop: true, hideTablet: true });
  });
});
