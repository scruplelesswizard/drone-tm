import useSignedInRole, { SignedInRole } from '@Hooks/useSignedInRole';
import { useTypedSelector } from '@Store/hooks';
import ToolTip from '@Components/RadixComponents/ToolTip';
import { m } from '@/paraglide/messages';

const OPTIONS: { role: SignedInRole; label: () => string }[] = [
  { role: 'PROJECT_CREATOR', label: m.nav_role_toggle_manage },
  { role: 'DRONE_PILOT', label: m.nav_role_toggle_operate },
];

export default function RoleToggle() {
  const [role, setRole] = useSignedInRole();
  const disabledReason = useTypedSelector(
    state => state.common.roleToggleDisabledReason,
  );

  const group = (
    <div
      role="group"
      aria-label={m.nav_role_toggle_aria_label()}
      className="naxatw-flex naxatw-rounded-full naxatw-border naxatw-border-grey-300 naxatw-bg-grey-50 naxatw-p-0.5"
    >
      {OPTIONS.map(option => {
        const active = role === option.role;
        const disabled = !active && !!disabledReason;
        let stateClassName = 'naxatw-text-grey-600 hover:naxatw-text-grey-800';
        if (active) stateClassName = 'naxatw-bg-red naxatw-text-white';
        else if (disabled)
          stateClassName = 'naxatw-cursor-not-allowed naxatw-text-grey-400';
        return (
          <button
            key={option.role}
            type="button"
            aria-pressed={active}
            disabled={disabled}
            onClick={() => {
              if (active || disabled) return;
              setRole(option.role);
            }}
            className={`naxatw-rounded-full naxatw-px-3 naxatw-py-1 naxatw-text-xs naxatw-font-medium naxatw-transition-colors ${stateClassName}`}
          >
            {option.label()}
          </button>
        );
      })}
    </div>
  );

  if (!disabledReason) return group;

  return (
    <ToolTip message={disabledReason} side="bottom">
      {group}
    </ToolTip>
  );
}
