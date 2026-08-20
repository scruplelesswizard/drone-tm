import { Button } from '@Components/RadixComponents/Button';
import Modal from '@Components/common/Modal';
import { m } from '@/paraglide/messages';

interface MissingDemModalProps {
  show: boolean;
  onCancel: () => void;
  onGenerateAnyway: () => void;
}

// Extracted verbatim from MapSection's JSX - onCancel/onGenerateAnyway
// still own the actual state changes (setShowMissingDemModal/
// setAllowMissingDem/toast) in the parent.
export default function MissingDemModal({
  show,
  onCancel,
  onGenerateAnyway,
}: MissingDemModalProps) {
  return (
    <Modal
      show={show}
      title={m.drone_task_no_dem_found()}
      className="naxatw-w-[92vw] naxatw-max-w-[32rem]"
      onClose={onCancel}
    >
      <div className="naxatw-space-y-4">
        <p className="naxatw-text-sm naxatw-text-[#7A7676]">
          {m.drone_task_missing_dem_blocked()}
        </p>
        <p className="naxatw-text-sm naxatw-text-[#7A7676]">
          {m.drone_task_missing_dem_override()}
        </p>
        <div className="naxatw-flex naxatw-justify-end naxatw-gap-2">
          <Button variant="outline" onClick={onCancel}>
            {m.common_cancel()}
          </Button>
          <Button className="naxatw-bg-red" onClick={onGenerateAnyway}>
            {m.drone_task_generate_anyway()}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
