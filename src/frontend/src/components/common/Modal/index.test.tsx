import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import Modal from '.';

describe('Modal', () => {
  it('exposes dialog semantics labelled by the title', () => {
    render(
      <Modal show title="Delete project" onClose={vi.fn()}>
        <p>Are you sure?</p>
      </Modal>,
    );

    const dialog = screen.getByRole('dialog', { name: 'Delete project' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  it('calls onClose on Escape', () => {
    const onClose = vi.fn();
    render(
      <Modal show title="Delete project" onClose={onClose}>
        <p>Are you sure?</p>
      </Modal>,
    );

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when the close button is clicked', () => {
    const onClose = vi.fn();
    render(
      <Modal show title="Delete project" onClose={onClose}>
        <p>Are you sure?</p>
      </Modal>,
    );

    fireEvent.click(screen.getByRole('button', { name: /close/i }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not render when show is false', () => {
    render(
      <Modal show={false} title="Delete project" onClose={vi.fn()}>
        <p>Are you sure?</p>
      </Modal>,
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
