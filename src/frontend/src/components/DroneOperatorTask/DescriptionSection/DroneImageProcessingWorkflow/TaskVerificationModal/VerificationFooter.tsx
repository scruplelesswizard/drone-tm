import { FlexRow } from '@Components/common/Layouts';
import { Button } from '@Components/RadixComponents/Button';
import { m } from '@/paraglide/messages';

interface VerificationFooterProps {
  onClose: () => void;
  onFindFlightGaps: () => void;
  isFindingFlightGaps: boolean;
  onVerify: () => void;
  isVerifying: boolean;
  hasImages: boolean;
  isAlreadyVerified: boolean;
}

export default function VerificationFooter({
  onClose,
  onFindFlightGaps,
  isFindingFlightGaps,
  onVerify,
  isVerifying,
  hasImages,
  isAlreadyVerified,
}: VerificationFooterProps) {
  return (
    <div className="naxatw-flex naxatw-items-center naxatw-justify-between naxatw-border-t naxatw-px-6 naxatw-py-4">
      <div className="naxatw-text-sm naxatw-text-gray-500">
        {m.task_verification_footer_help()}
      </div>
      <FlexRow className="naxatw-gap-3">
        <Button
          variant="ghost"
          className="naxatw-border naxatw-border-gray-300"
          onClick={onClose}
        >
          {m.common_cancel()}
        </Button>
        <Button
          variant="outline"
          className="naxatw-border-red-600 naxatw-text-red-700 hover:naxatw-bg-red-50 disabled:naxatw-opacity-50"
          onClick={onFindFlightGaps}
          disabled={isFindingFlightGaps || !hasImages}
          leftIcon={isFindingFlightGaps ? 'sync' : 'search'}
        >
          {isFindingFlightGaps
            ? m.task_verification_finding_gaps()
            : m.task_verification_identify_flight_gaps()}
        </Button>
        <Button
          variant="ghost"
          className="naxatw-bg-green-600 naxatw-text-white hover:naxatw-bg-green-700 disabled:naxatw-opacity-50"
          onClick={onVerify}
          disabled={isVerifying || !hasImages || isAlreadyVerified}
          leftIcon={isVerifying ? 'sync' : 'check_circle'}
        >
          {(() => {
            if (isVerifying) return m.common_verifying();
            if (isAlreadyVerified)
              return m.task_verification_already_fully_flown();
            return m.task_verification_mark_fully_flown();
          })()}
        </Button>
      </FlexRow>
    </div>
  );
}
