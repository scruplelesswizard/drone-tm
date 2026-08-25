import { useCallback, useEffect, useState } from 'react';

export type SignedInRole = 'PROJECT_CREATOR' | 'DRONE_PILOT';

const STORAGE_KEY = 'signedInAs';
const CHANGE_EVENT = 'signedinas-change';

const readRole = (): SignedInRole =>
  (localStorage.getItem(STORAGE_KEY) as SignedInRole) || 'PROJECT_CREATOR';

/**
 * Every user is granted both roles at sign-up now - this just tracks which
 * one the UI is currently presenting (the header's Manage/Operate toggle).
 * Backed by localStorage so it survives reloads and stays in sync with the
 * non-component code (OAuth/Hanko redirects) that reads/writes the same
 * key directly; the custom event is what makes the toggle reactive without
 * a full page navigation.
 */
export default function useSignedInRole() {
  const [role, setRoleState] = useState<SignedInRole>(readRole);

  useEffect(() => {
    const sync = () => setRoleState(readRole());
    window.addEventListener(CHANGE_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(CHANGE_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const setRole = useCallback((next: SignedInRole) => {
    localStorage.setItem(STORAGE_KEY, next);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);

  return [role, setRole] as const;
}
