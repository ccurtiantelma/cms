import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../../../test/utils';
import UnderConstruction from './UnderConstruction';

describe('UnderConstruction', () => {
  it('mostra "In costruzione" all\'hover e rende il controllo inerte', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <UnderConstruction>
        <button type="button">Ombra</button>
      </UnderConstruction>,
    );

    const wrapper = document.querySelector('[data-under-construction]') as HTMLElement;
    await user.hover(wrapper);
    expect(await screen.findByText('In costruzione')).toBeInTheDocument();

    // jsdom non applica `inert`/`pointer-events`: si verifica il contratto (attributo), non il click.
    expect(
      screen.getByRole('button', { name: 'Ombra', hidden: true }).closest('[inert]'),
    ).not.toBeNull();
    expect(wrapper).toHaveAttribute('aria-disabled', 'true');
  });
});
