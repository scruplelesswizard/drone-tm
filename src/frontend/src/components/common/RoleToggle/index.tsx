import useSignedInRole, { SignedInRole } from '@Hooks/useSignedInRole';
import { m } from '@/paraglide/messages';

const OPTIONS: { role: SignedInRole; label: () => string }[] = [
  { role: 'PROJECT_CREATOR', label: m.nav_role_toggle_manage },
  { role: 'DRONE_PILOT', label: m.nav_role_toggle_operate },
];

export default function RoleToggle() {
  const [role, setRole] = useSignedInRole();

  return (
    <div
      role="group"
      aria-label={m.nav_role_toggle_aria_label()}
      className="naxatw-flex naxatw-rounded-full naxatw-border naxatw-border-grey-300 naxatw-bg-grey-50 naxatw-p-0.5"
    >
      {OPTIONS.map(option => {
        const active = role === option.role;
        return (
          <button
            key={option.role}
            type="button"
            aria-pressed={active}
            onClick={() => {
              if (active) return;
              setRole(option.role);
            }}
            className={`naxatw-rounded-full naxatw-px-3 naxatw-py-1 naxatw-text-xs naxatw-font-medium naxatw-transition-colors ${
              active
                ? 'naxatw-bg-red naxatw-text-white'
                : 'naxatw-text-grey-600 hover:naxatw-text-grey-800'
            }`}
          >
            {option.label()}
          </button>
        );
      })}
    </div>
  );
}
