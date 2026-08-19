import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import Drawer from '.';

describe('Drawer', () => {
  it('exposes dialog semantics', () => {
    render(
      <Drawer open onClose={vi.fn()}>
        <button type="button">Save</button>
      </Drawer>,
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  it('calls onClose on Escape', () => {
    const onClose = vi.fn();
    render(
      <Drawer open onClose={onClose}>
        <button type="button">Save</button>
      </Drawer>,
    );

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when the overlay is clicked', () => {
    const onClose = vi.fn();
    const { container } = render(
      <Drawer open onClose={onClose}>
        <button type="button">Save</button>
      </Drawer>,
    );

    const overlay = container.querySelector('[role="presentation"]');
    expect(overlay).not.toBeNull();
    fireEvent.click(overlay as Element);

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
