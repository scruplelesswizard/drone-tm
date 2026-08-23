import { useState } from 'react';
import { FlexRow } from '@Components/common/Layouts';
import { Link } from 'react-router-dom';
import LanguageSwitcherLanding from '@Components/common/LanguageSwitcherLanding';
import Drawer from '@Components/common/Drawer';
import Icon from '@Components/common/Icon';
import { getRuntimeConfig } from '@/runtimeConfig';
import { m } from '@/paraglide/messages';
import packageInfo from '../../../../package.json';

// Auth configuration for SSO session verification
const AUTH_PROVIDER = getRuntimeConfig('VITE_AUTH_PROVIDER', 'legacy');
const HANKO_URL = getRuntimeConfig(
  'VITE_HANKO_URL',
  'https://dev.login.hotosm.org',
);
const FRONTEND_URL =
  import.meta.env.VITE_FRONTEND_URL || window.location.origin;

// Import Hanko web component for session verification
if (AUTH_PROVIDER === 'hanko') {
  void import('@hotosm/hanko-auth');
}

export default function Navbar() {
  // Return URL for hanko-auth callback
  const hankoReturnUrl = `${FRONTEND_URL}/hanko-auth`;
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <header>
      {/* Hidden auth component for session verification - redirects to /hanko-auth if user has SSO session */}
      {AUTH_PROVIDER === 'hanko' && (
        <div style={{ display: 'none' }}>
          <hotosm-auth
            hanko-url={HANKO_URL}
            base-path={HANKO_URL}
            redirect-after-login={hankoReturnUrl}
            redirect-after-logout={FRONTEND_URL}
          />
        </div>
      )}
      <FlexRow
        gap={10}
        className="naxatw-items-center naxatw-justify-between naxatw-border-landing-white naxatw-bg-landing-red naxatw-px-2 naxatw-py-2 naxatw-text-xs naxatw-text-landing-white sm:naxatw-px-20"
      >
        <span className="naxatw-hidden naxatw-whitespace-nowrap naxatw-opacity-75 sm:naxatw-inline">
          v{packageInfo.version}
        </span>

        {/* Desktop link row */}
        <FlexRow
          gap={5}
          className="naxatw-hidden naxatw-h-fit naxatw-flex-nowrap naxatw-items-center naxatw-text-xs naxatw-leading-none sm:naxatw-flex"
        >
          <Link
            className="naxatw-whitespace-nowrap naxatw-border-r naxatw-pr-3 hover:naxatw-underline"
            to="/tutorials"
          >
            {m.landing_navbar_tutorials()}
          </Link>

          <a
            href="https://docs.drone.hotosm.org "
            className="naxatw-whitespace-nowrap"
          >
            <p className="naxatw-border-r naxatw-pr-3 hover:naxatw-underline">
              {m.landing_navbar_documentation()}
            </p>
          </a>

          <a
            href="https://github.com/hotosm/Drone-TM/#drone-support"
            className="naxatw-whitespace-nowrap"
          >
            <p className="naxatw-pr-3 hover:naxatw-underline">
              {m.landing_navbar_supported_drones()}
            </p>
          </a>
          <LanguageSwitcherLanding />
        </FlexRow>

        {/* Mobile hamburger */}
        <button
          type="button"
          className="naxatw-flex naxatw-items-center sm:naxatw-hidden"
          onClick={() => setDrawerOpen(true)}
          aria-label={m.nav_open_menu_aria_label()}
        >
          <Icon name="menu" className="naxatw-text-landing-white" />
        </button>
      </FlexRow>

      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)}>
        <div className="naxatw-flex naxatw-flex-col naxatw-gap-4 naxatw-p-4">
          <div className="naxatw-flex naxatw-items-center naxatw-justify-between">
            <span className="naxatw-text-xs naxatw-text-grey-500">
              v{packageInfo.version}
            </span>
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              aria-label={m.nav_close_menu_aria_label()}
            >
              <Icon name="close" />
            </button>
          </div>
          <div className="naxatw-flex naxatw-flex-col naxatw-gap-3 naxatw-text-body-btn">
            <Link
              onClick={() => setDrawerOpen(false)}
              to="/tutorials"
              className="hover:naxatw-underline"
            >
              {m.landing_navbar_tutorials()}
            </Link>
            <a
              href="https://docs.drone.hotosm.org "
              className="hover:naxatw-underline"
            >
              {m.landing_navbar_documentation()}
            </a>
            <a
              href="https://github.com/hotosm/Drone-TM/#drone-support"
              className="hover:naxatw-underline"
            >
              {m.landing_navbar_supported_drones()}
            </a>
          </div>
          <div className="naxatw-border-t naxatw-border-grey-300 naxatw-pt-4">
            <LanguageSwitcherLanding className="naxatw-text-grey-800" />
          </div>
        </div>
      </Drawer>
    </header>
  );
}
