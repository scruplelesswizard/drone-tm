import { render, screen } from '@testing-library/react';
import { useForm } from 'react-hook-form';
import { afterEach, describe, expect, it } from 'vitest';
import BasicDetails from '.';

function Harness() {
  const { register, setValue, formState, control, watch } = useForm();
  return (
    <BasicDetails
      formProps={{ register, setValue, formState, control, watch }}
    />
  );
}

describe('CompleteUserProfile BasicDetails', () => {
  afterEach(() => {
    localStorage.clear();
  });

  it('falls back to the placeholder avatar when the stored profile has no profile_img, not a broken src=""', () => {
    localStorage.setItem(
      'userprofile',
      JSON.stringify({ name: 'Local Test User', profile_img: '' }),
    );

    render(<Harness />);

    const img = screen.getByRole('img');
    expect(img.getAttribute('src')).not.toBe('');
    expect(img.getAttribute('src')).toMatch(/avatar-images/);
  });

  it('falls back to the placeholder avatar when no profile is stored at all', () => {
    render(<Harness />);

    expect(screen.getByRole('img').getAttribute('src')).toMatch(
      /avatar-images/,
    );
  });
});
