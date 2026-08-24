import { useLocation, useNavigate } from 'react-router-dom';
import { useTypedDispatch } from '@Store/hooks';
import useAuth from '@Hooks/useAuth';
import { FlexColumn, FlexRow } from '@Components/common/Layouts';
import { Button } from '@Components/RadixComponents/Button';
import Image from '@Components/RadixComponents/Image';
import droneTMLogo from '@Assets/images/DTM-logo-black.svg';
import droneTaskingIllustration from '@Assets/images/LandingPage/project-creator.svg';
import Icon from '@Components/common/Icon';
import { setCommonState } from '@Store/actions/common';
import { motion } from 'framer-motion';
import { slideVariants } from '@Constants/animations';
import { getRuntimeConfig } from '@/runtimeConfig';
import { m } from '@/paraglide/messages';

const AUTH_PROVIDER = getRuntimeConfig('VITE_AUTH_PROVIDER', 'legacy');
const HANKO_URL = getRuntimeConfig(
  'VITE_HANKO_URL',
  'https://dev.login.hotosm.org',
);
const FRONTEND_URL =
  import.meta.env.VITE_FRONTEND_URL || window.location.origin;

export default function SignInOverlay() {
  const dispatch = useTypedDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated } = useAuth();

  const handleContinue = () => {
    // Every account gets both roles now (Manage/Operate is a header
    // toggle post sign-in) - this is just the internal handshake value
    // for the initial login request, not a user choice anymore.
    localStorage.setItem('signedInAs', 'PROJECT_CREATOR');

    if (AUTH_PROVIDER === 'hanko') {
      // Clear any existing Hanko session to force fresh login
      // This prevents account confusion when switching users
      document.cookie = `hanko=; path=/; max-age=0; domain=${
        window.location.hostname
      }`;
      document.cookie = 'hanko=; path=/; max-age=0'; // Also clear without domain

      // Use FRONTEND_URL to ensure consistent domain (127.0.0.1) for cookies
      // Return to /hanko-auth callback which validates with backend and sets up user profile
      const returnUrl = `${FRONTEND_URL}/hanko-auth?role=PROJECT_CREATOR`;
      window.location.href = `${HANKO_URL}/app?return_to=${encodeURIComponent(returnUrl)}`;
      return;
    }

    if (isAuthenticated()) {
      void navigate('/projects');
    } else {
      void navigate('/login', {
        state: { from: location.state?.from },
      });
    }
  };

  return (
    <motion.section
      initial="hidden"
      animate="visible"
      exit="exit"
      variants={slideVariants}
      transition={{ duration: 0.5 }}
      className="naxatw-font-manrope naxatw-fixed naxatw-inset-0 naxatw-z-20 naxatw-bg-white naxatw-px-8 naxatw-py-8 md:naxatw-px-16 lg:naxatw-px-36 lg:naxatw-py-12"
    >
      <FlexRow className="naxatw-items-center naxatw-justify-between">
        <Image src={droneTMLogo} />
        <Icon
          name="close"
          onClick={() => {
            dispatch(setCommonState({ openSignInMenu: false }));
            void navigate(location.pathname, { replace: true, state: null });
          }}
        />
      </FlexRow>
      <FlexRow className="naxatw-mt-12 naxatw-w-full naxatw-justify-center naxatw-px-6 lg:naxatw-px-16">
        <FlexColumn
          gap={5}
          className="naxatw-w-full naxatw-max-w-[26rem] naxatw-items-center naxatw-rounded-lg naxatw-border naxatw-border-grey-200 naxatw-px-10 naxatw-py-8 naxatw-text-landing-red lg:naxatw-px-16 lg:naxatw-py-14 xl:naxatw-px-24 xl:naxatw-py-20"
        >
          <h5>{m.landing_signin_overlay_heading()}</h5>
          <Image src={droneTaskingIllustration} />
          <Button
            className="naxatw-whitespace-nowrap !naxatw-bg-landing-red"
            rightIcon="east"
            onClick={handleContinue}
          >
            {m.landing_signin_overlay_cta()}
          </Button>
        </FlexColumn>
      </FlexRow>
    </motion.section>
  );
}
