import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../../test/utils';
import SpacingBoxInput, { type SpacingBoxInputValue } from './SpacingBoxInput';

const initialValue: SpacingBoxInputValue = {
  top: 8,
  right: 16,
  bottom: 24,
  left: 32,
  unit: 'px',
};

function renderInput(value = initialValue, onChange = vi.fn()) {
  renderWithProviders(<SpacingBoxInput label="Padding" value={value} onChange={onChange} />);
  return onChange;
}

describe('SpacingBoxInput', () => {
  it('rende i quattro lati, l’unità e il controllo accessibile di collegamento', () => {
    renderInput();

    expect(screen.getByRole('group', { name: 'Padding' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Padding Top' })).toHaveValue('8');
    expect(screen.getByRole('textbox', { name: 'Padding Right' })).toHaveValue('16');
    expect(screen.getByRole('textbox', { name: 'Padding Bottom' })).toHaveValue('24');
    expect(screen.getByRole('textbox', { name: 'Padding Left' })).toHaveValue('32');
    expect(screen.getByRole('textbox', { name: 'Padding Unità' })).toHaveValue('px');
    expect(screen.getByRole('button', { name: 'Collega i lati' })).toBeInTheDocument();
  });

  it('propaga il valore a tutti i lati quando il controllo è collegato', async () => {
    const user = userEvent.setup();
    const onChange = renderInput();

    await user.click(screen.getByRole('button', { name: 'Collega i lati' }));
    await user.clear(screen.getByRole('textbox', { name: 'Padding Right' }));
    await user.type(screen.getByRole('textbox', { name: 'Padding Right' }), '20');

    expect(onChange).toHaveBeenLastCalledWith({
      top: 20,
      right: 20,
      bottom: 20,
      left: 20,
      unit: 'px',
    });
  });

  it('sblocca i lati e cambia solo il lato modificato', async () => {
    const user = userEvent.setup();
    const onChange = renderInput();

    await user.click(screen.getByRole('button', { name: 'Collega i lati' }));
    await user.click(screen.getByRole('button', { name: 'Sblocca i lati' }));
    await user.clear(screen.getByRole('textbox', { name: 'Padding Left' }));
    await user.type(screen.getByRole('textbox', { name: 'Padding Left' }), '40');

    expect(onChange).toHaveBeenLastCalledWith({ ...initialValue, left: 40 });
  });

  it('cambia l’unità preservando i valori', async () => {
    const user = userEvent.setup();
    const onChange = renderInput();

    await user.click(screen.getByRole('textbox', { name: 'Padding Unità' }));
    await user.click(screen.getByRole('option', { name: 'rem' }));

    expect(onChange).toHaveBeenLastCalledWith({ ...initialValue, unit: 'rem' });
  });
});