import {
  droneModelOptions,
  gimbalAngleOptions,
  getWaypointModeOptions,
} from '@Constants/taskDescription';
import Select from '@Components/common/FormUI/Select';
import SwitchTab from '@Components/common/SwitchTab';
import { m } from '@/paraglide/messages';

interface MapControlsBarProps {
  droneModel: string | number;
  onDroneModelChange: (value: string | number) => void;
  gimbalAngle: string | number;
  onGimbalAngleChange: (value: { value: string | number }) => void;
  waypointMode: string | number;
  waypointModeOptions: ReturnType<typeof getWaypointModeOptions>;
  onWaypointModeChange: (value: { value: string | number }) => void;
}

// Drone model / gimbal angle / waypoint mode selectors, extracted verbatim
// from MapSection's JSX. Dispatch stays in the parent.
export default function MapControlsBar({
  droneModel,
  onDroneModelChange,
  gimbalAngle,
  onGimbalAngleChange,
  waypointMode,
  waypointModeOptions,
  onWaypointModeChange,
}: MapControlsBarProps) {
  return (
    <div className="flex gap-3 lg:gap-6 naxatw-absolute naxatw-right-3 naxatw-top-3 naxatw-z-10 lg:naxatw-right-64">
      <Select
        options={droneModelOptions}
        labelKey="label"
        valueKey="value"
        selectedOption={droneModel}
        onChange={onDroneModelChange}
        className="naxatw-w-40 naxatw-bg-[#F4F7FE]"
        placeholder={m.flight_gap_select_model_placeholder()}
      />

      <SwitchTab
        activeClassName="naxatw-bg-red naxatw-text-white"
        options={gimbalAngleOptions}
        labelKey="label"
        valueKey="value"
        selectedValue={gimbalAngle}
        onChange={onGimbalAngleChange}
      />

      <SwitchTab
        activeClassName="naxatw-bg-red naxatw-text-white"
        options={waypointModeOptions}
        labelKey="label"
        valueKey="value"
        selectedValue={waypointMode}
        onChange={onWaypointModeChange}
      />
    </div>
  );
}
