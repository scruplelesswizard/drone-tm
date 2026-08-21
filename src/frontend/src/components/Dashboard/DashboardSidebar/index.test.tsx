import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import DashboardSidebar from '.';

describe('DashboardSidebar', () => {
  afterEach(() => {
    localStorage.clear();
  });

  it('falls back to the placeholder avatar when the stored profile has no profile_img, not a broken src=""', () => {
    localStorage.setItem(
      'userprofile',
      JSON.stringify({
        name: 'Local Test User',
        email_address: 'localtest@example.com',
        profile_img: '',
      }),
    );

    render(
      <MemoryRouter>
        <DashboardSidebar />
      </MemoryRouter>,
    );

    const img = screen.getByRole('img');
    expect(img.getAttribute('src')).not.toBe('');
    expect(img.getAttribute('src')).toMatch(/avatar-images/);
  });
});
