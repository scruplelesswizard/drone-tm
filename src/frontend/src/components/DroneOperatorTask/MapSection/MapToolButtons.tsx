import { Button } from '@Components/RadixComponents/Button';
import ToolTip from '@Components/RadixComponents/ToolTip';
import Icon from '@Components/common/Icon';
import areaIcon from '@Assets/images/area-icon.png';
import { m } from '@/paraglide/messages';

interface MapToolButtonsProps {
  isRotationEnabled: boolean;
  onToggleRotation: () => void;
  showFlightPlan: boolean;
  onToggleFlightPlan: () => void;
  showTaskArea: boolean;
  onToggleTaskArea: () => void;
  onZoomToExtent: () => void;
}

// Rotation / flight-plan / task-area / zoom toggle buttons, extracted
// verbatim from MapSection's JSX. All handlers are called as-is from the
// parent, which still owns the underlying state/map interaction.
export default function MapToolButtons({
  isRotationEnabled,
  onToggleRotation,
  showFlightPlan,
  onToggleFlightPlan,
  showTaskArea,
  onToggleTaskArea,
  onZoomToExtent,
}: MapToolButtonsProps) {
  return (
    <div className="naxatw-absolute naxatw-left-[0.575rem] naxatw-top-[5.75rem] naxatw-z-30 naxatw-flex naxatw-h-fit naxatw-w-fit naxatw-flex-col naxatw-gap-3">
      <ToolTip
        message={m.drone_task_enable_rotation()}
        className="naxatw-mt-[-4px]"
      >
        <Button
          className={`naxatw-grid naxatw-h-[1.85rem] naxatw-place-items-center naxatw-border !naxatw-p-[0.315rem] ${isRotationEnabled ? 'naxatw-border-red naxatw-bg-[#ffe0e0]' : 'naxatw-border-gray-400 naxatw-bg-[#F5F5F5]'}`}
          onClick={onToggleRotation}
        >
          <Icon
            name="rotate_90_degrees_cw"
            iconSymbolType="material-icons"
            className="!naxatw-text-xl !naxatw-text-black"
          />
        </Button>
      </ToolTip>
      <ToolTip
        message={m.drone_task_show_flight_plan()}
        className="naxatw-mt-[-4px]"
      >
        <Button
          className={`naxatw-grid naxatw-h-[1.85rem] naxatw-place-items-center naxatw-border !naxatw-p-[0.315rem] ${showFlightPlan ? 'naxatw-border-red naxatw-bg-[#ffe0e0]' : 'naxatw-border-gray-400 naxatw-bg-[#F5F5F5]'}`}
          onClick={onToggleFlightPlan}
        >
          <Icon
            name="flight_take_off"
            iconSymbolType="material-icons"
            className="naxatw-w-[1.25rem] !naxatw-text-xl !naxatw-text-black"
          />
        </Button>
      </ToolTip>

      <Button
        variant="ghost"
        className={`naxatw-flex naxatw-h-[1.85rem] naxatw-w-[] naxatw-items-center naxatw-justify-center naxatw-border !naxatw-px-[0.315rem] ${showTaskArea ? 'naxatw-border-red naxatw-bg-[#ffe0e0]' : 'naxatw-border-gray-400 naxatw-bg-[#F5F5F5]'}`}
        onClick={onToggleTaskArea}
        title={m.map_button_task_area()}
      >
        <div className="naxatw-h-4 naxatw-w-4">
          <img src={areaIcon} alt="area-icon" />
        </div>
      </Button>

      <ToolTip
        message={m.drone_task_zoom_to_task_area()}
        className="naxatw-mt-[-4px]"
      >
        <Button
          className="naxatw-grid naxatw-h-[1.85rem] naxatw-place-items-center naxatw-border naxatw-border-gray-400 naxatw-bg-[#F5F5F5] !naxatw-p-[0.315rem]"
          onClick={onZoomToExtent}
        >
          <Icon
            name="zoom_out_map"
            iconSymbolType="material-icons"
            className="naxatw-w-[1.25rem] !naxatw-text-xl !naxatw-text-black"
          />
        </Button>
      </ToolTip>
    </div>
  );
}
