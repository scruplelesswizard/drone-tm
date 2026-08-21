import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import UserAvatar from '.';

describe('UserAvatar', () => {
  it('renders the real image when a profile image URL is provided', () => {
    render(<UserAvatar imageSource="https://example.com/avatar.jpg" />);

    expect(screen.getByRole('img')).toHaveAttribute(
      'src',
      'https://example.com/avatar.jpg',
    );
  });

  it('falls back to the placeholder avatar for an empty profile image, not a broken src=""', () => {
    render(<UserAvatar imageSource="" />);

    const img = screen.getByRole('img');
    expect(img.getAttribute('src')).not.toBe('');
    expect(img.getAttribute('src')).toMatch(/avatar-images/);
  });

  it('falls back to the placeholder avatar when no profile image is given at all', () => {
    render(<UserAvatar />);

    expect(screen.getByRole('img').getAttribute('src')).toMatch(
      /avatar-images/,
    );
  });
});
