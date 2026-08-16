import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import Icon from '.';

describe('Icon', () => {
  it('renders the icon name and applies the icon symbol class', () => {
    render(<Icon name="close" />);

    const icon = screen.getByRole('button', { name: 'close' });
    expect(icon).toBeInTheDocument();
    expect(icon).toHaveClass('material-symbols-outlined');
  });

  it('calls onClick when clicked', async () => {
    const onClick = vi.fn();
    render(<Icon name="close" onClick={onClick} />);

    screen.getByRole('button', { name: 'close' }).click();

    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
