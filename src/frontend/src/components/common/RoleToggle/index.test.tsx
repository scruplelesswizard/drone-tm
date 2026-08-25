import { configureStore } from '@reduxjs/toolkit';
import { fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { afterEach, describe, expect, it } from 'vitest';
import { setCommonState } from '@Store/actions/common';
import rootReducer from '@Store/reducers';
import RoleToggle from '.';

function renderWithStore(disabledReason: string | null = null) {
  const store = configureStore({ reducer: rootReducer });
  store.dispatch(setCommonState({ roleToggleDisabledReason: disabledReason }));
  render(
    <Provider store={store}>
      <RoleToggle />
    </Provider>,
  );
}

describe('RoleToggle', () => {
  afterEach(() => {
    localStorage.clear();
  });

  it('marks Manage as active by default (no stored role)', () => {
    renderWithStore();

    expect(screen.getByRole('button', { name: 'Manage' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Operate' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('switches the active role on click and persists it', () => {
    renderWithStore();

    fireEvent.click(screen.getByRole('button', { name: 'Operate' }));

    expect(screen.getByRole('button', { name: 'Operate' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(localStorage.getItem('signedInAs')).toBe('DRONE_PILOT');
  });

  it('disables the inactive role and blocks switching when a reason is set', () => {
    renderWithStore('Switch away from "Request Logs" first.');

    const operateButton = screen.getByRole('button', { name: 'Operate' });
    expect(operateButton).toBeDisabled();

    fireEvent.click(operateButton);

    expect(screen.getByRole('button', { name: 'Manage' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(localStorage.getItem('signedInAs')).not.toBe('DRONE_PILOT');
  });
});
