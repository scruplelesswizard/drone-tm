import { configureStore } from '@reduxjs/toolkit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import rootReducer from '@Store/reducers';
import { signUpUser } from '@Services/common';
import SignUp from '.';

vi.mock('@Services/common', () => ({
  signUpUser: vi.fn(),
}));

function renderSignUp() {
  const store = configureStore({ reducer: rootReducer });
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });

  return render(
    <Provider store={store}>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/signup']}>
          <Routes>
            <Route path="/signup" element={<SignUp />} />
            <Route path="/login" element={<div>Login Page</div>} />
            <Route
              path="/complete-profile"
              element={<div>Complete Profile Page</div>}
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </Provider>,
  );
}

describe('SignUp', () => {
  afterEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('renders name, email, and password fields plus the submit button', () => {
    renderSignUp();

    expect(screen.getByLabelText(/full name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign Up' })).toBeInTheDocument();
  });

  it('blocks submission and shows an error when the passwords do not match', async () => {
    renderSignUp();

    fireEvent.change(screen.getByLabelText(/full name/i), {
      target: { value: 'Test User' },
    });
    fireEvent.change(screen.getByLabelText(/^email/i), {
      target: { value: 'test@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/^password/i), {
      target: { value: 'StrongPass123!' },
    });
    fireEvent.change(screen.getByLabelText(/confirm password/i), {
      target: { value: 'Different123!' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sign Up' }));

    expect(
      await screen.findByText('Passwords do not match'),
    ).toBeInTheDocument();
    expect(signUpUser).not.toHaveBeenCalled();
  });

  it('navigates to /login when "Log in" is clicked', () => {
    renderSignUp();

    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));

    expect(screen.getByText('Login Page')).toBeInTheDocument();
  });

  it('submits the form and stores the returned tokens on success', async () => {
    vi.mocked(signUpUser).mockResolvedValue({
      data: {
        access_token: 'test-access-token',
        refresh_token: 'test-refresh-token',
      },
    } as never);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: () => Promise.resolve({ has_user_profile: false }),
      }),
    );

    renderSignUp();

    fireEvent.change(screen.getByLabelText(/full name/i), {
      target: { value: 'Test User' },
    });
    fireEvent.change(screen.getByLabelText(/^email/i), {
      target: { value: 'test@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/^password/i), {
      target: { value: 'StrongPass123!' },
    });
    fireEvent.change(screen.getByLabelText(/confirm password/i), {
      target: { value: 'StrongPass123!' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sign Up' }));

    await waitFor(() => {
      expect(localStorage.getItem('token')).toBe('test-access-token');
    });
    expect(localStorage.getItem('refresh')).toBe('test-refresh-token');
    expect(localStorage.getItem('signedInAs')).toBe('PROJECT_CREATOR');

    vi.unstubAllGlobals();
  });
});
