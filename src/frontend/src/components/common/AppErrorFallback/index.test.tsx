import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AppErrorFallback from '.';

describe('AppErrorFallback', () => {
  it('shows the error message and a retry control', () => {
    render(
      <AppErrorFallback
        error={new Error('boom')}
        resetErrorBoundary={vi.fn()}
      />,
    );

    expect(screen.getByText('An error occurred')).toBeInTheDocument();
    expect(screen.getByText('Error: boom')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Retry' }),
    ).toBeInTheDocument();
  });

  it('calls resetErrorBoundary when retry is clicked', () => {
    const resetErrorBoundary = vi.fn();
    render(
      <AppErrorFallback
        error={new Error('boom')}
        resetErrorBoundary={resetErrorBoundary}
      />,
    );

    screen.getByRole('button', { name: 'Retry' }).click();

    expect(resetErrorBoundary).toHaveBeenCalledTimes(1);
  });

  it('omits the message line for a non-Error thrown value', () => {
    render(
      <AppErrorFallback error="not an Error instance" resetErrorBoundary={vi.fn()} />,
    );

    expect(screen.getByText('An error occurred')).toBeInTheDocument();
    expect(screen.queryByText(/^Error:/)).not.toBeInTheDocument();
  });
});
