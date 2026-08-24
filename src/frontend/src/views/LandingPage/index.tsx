import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Navbar,
  Home,
  AboutTM,
  OurRationale,
  OpenSource,
  Features,
  MajorImpacts,
  CaseStudies,
  ClientAndPartners,
  Footer,
  TalkToUs,
} from '@Components/LandingPage';
import MobileAppDownload from '@Components/LandingPage/MobileAppDownload';
import { toast } from 'react-toastify';
import { m } from '@/paraglide/messages';

export default function LandingPage() {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (location.state?.from) {
      toast.error(m.landing_signin_required_toast());
      void navigate('/login', { state: { from: location.state.from } });
    }
  }, [location, navigate]);

  return (
    <main className="landing-page naxatw-font-secondary">
      <Navbar />
      <Home />
      <AboutTM />
      <CaseStudies />
      <OurRationale />
      <OpenSource />
      <Features />
      <MobileAppDownload />
      <MajorImpacts />
      <ClientAndPartners />
      <TalkToUs />
      <Footer />
    </main>
  );
}
