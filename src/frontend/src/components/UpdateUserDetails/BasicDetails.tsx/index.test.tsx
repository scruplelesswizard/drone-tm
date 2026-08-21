import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it } from 'vitest';
import BasicDetails from '.';

function renderWithQueryClient() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <BasicDetails />
    </QueryClientProvider>,
  );
}

describe('UpdateUserDetails BasicDetails', () => {
  afterEach(() => {
    localStorage.clear();
  });

  it('falls back to the placeholder avatar when the stored profile has no profile_img, not a broken src=""', () => {
    localStorage.setItem(
      'userprofile',
      JSON.stringify({ name: 'Local Test User', profile_img: '' }),
    );

    renderWithQueryClient();

    const img = screen.getByRole('img');
    expect(img.getAttribute('src')).not.toBe('');
    expect(img.getAttribute('src')).toMatch(/avatar-images/);
  });

  it('falls back to the placeholder avatar when no profile is stored at all', () => {
    renderWithQueryClient();

    expect(screen.getByRole('img').getAttribute('src')).toMatch(
      /avatar-images/,
    );
  });
});
