import { Map as MapLibreMap } from 'maplibre-gl';
import MapContainer from '@Components/common/MapLibreComponents/MapContainer';
import VectorLayer from '@Components/common/MapLibreComponents/Layers/VectorLayer';
import BaseLayerSwitcherUI from '@Components/common/BaseLayerSwitcher';
import { GeojsonType } from '@Components/common/MapLibreComponents/types';
import { TaskVerificationData } from '@Services/classification';
import { m } from '@/paraglide/messages';

interface TaskMapPanelProps {
  map: MapLibreMap | null;
  isMapLoaded: boolean;
  isStyleReady: boolean;
  verificationData: TaskVerificationData | undefined;
  // Loosely typed to match imagesGeoJson()'s inferred return in the parent -
  // image.location isn't a strict GeoJSON Geometry there either, so this
  // mirrors that rather than tightening a type the source data doesn't
  // actually satisfy.
  imageGeoJsonData: { type: 'FeatureCollection'; features: unknown[] } | null;
  coveragePercentage: number;
  isLowCoverage: boolean;
}

// Map + its overlays, extracted verbatim from TaskVerificationModal's JSX.
// All map lifecycle (init/effects/popups) stays in the parent - this only
// owns layout/markup for a given map instance.
export default function TaskMapPanel({
  map,
  isMapLoaded,
  isStyleReady,
  verificationData,
  imageGeoJsonData,
  coveragePercentage,
  isLowCoverage,
}: TaskMapPanelProps) {
  return (
    <div className="naxatw-relative naxatw-flex-1">
      <MapContainer
        map={map}
        isMapLoaded={isMapLoaded}
        containerId="task-verification-map"
        style={{
          width: '100%',
          height: '100%',
        }}
      >
        <BaseLayerSwitcherUI />

        {/* Task polygon */}
        {map &&
          isMapLoaded &&
          isStyleReady &&
          verificationData?.task_geometry && (
            <VectorLayer
              map={map}
              isMapLoaded={isMapLoaded}
              id="task-polygon"
              geojson={
                {
                  type: 'FeatureCollection',
                  features: [verificationData.task_geometry],
                } as GeojsonType
              }
              visibleOnMap
              layerOptions={{
                type: 'fill',
                paint: {
                  'fill-color': '#98BBC8',
                  'fill-outline-color': '#484848',
                  'fill-opacity': 0.4,
                },
              }}
            />
          )}

        {/* Task polygon outline */}
        {map &&
          isMapLoaded &&
          isStyleReady &&
          verificationData?.task_geometry && (
            <VectorLayer
              map={map}
              isMapLoaded={isMapLoaded}
              id="task-polygon-outline"
              geojson={
                {
                  type: 'FeatureCollection',
                  features: [verificationData.task_geometry],
                } as GeojsonType
              }
              visibleOnMap
              layerOptions={{
                type: 'line',
                paint: {
                  'line-color': '#484848',
                  'line-width': 2,
                },
              }}
            />
          )}

        {/* Image points */}
        {map &&
          isMapLoaded &&
          isStyleReady &&
          imageGeoJsonData &&
          imageGeoJsonData.features.length > 0 && (
            <VectorLayer
              map={map}
              isMapLoaded={isMapLoaded}
              id="task-image-points"
              geojson={imageGeoJsonData as GeojsonType}
              visibleOnMap
              layerOptions={{
                type: 'circle',
                paint: {
                  'circle-color': '#22c55e',
                  'circle-radius': 6,
                  'circle-stroke-width': 2,
                  'circle-stroke-color': '#ffffff',
                  'circle-stroke-opacity': 0.8,
                },
              }}
            />
          )}
      </MapContainer>

      {/* Stats Overlay */}
      <div className="naxatw-absolute naxatw-left-4 naxatw-top-4 naxatw-z-10 naxatw-rounded-lg naxatw-bg-white naxatw-p-4 naxatw-shadow-lg">
        <h4 className="naxatw-mb-2 naxatw-text-sm naxatw-font-semibold naxatw-text-gray-700">
          {m.common_task_statistics()}
        </h4>
        <div className="naxatw-flex naxatw-flex-col naxatw-gap-1 naxatw-text-sm">
          <div className="naxatw-flex naxatw-items-center naxatw-gap-2">
            <span className="naxatw-text-gray-600">
              {m.task_verification_images_label()}
            </span>
            <span className="naxatw-font-medium">
              {verificationData?.image_count || 0}
            </span>
          </div>
          <div className="naxatw-flex naxatw-items-center naxatw-gap-2">
            <span className="naxatw-text-gray-600">
              {m.task_verification_coverage_label()}
            </span>
            <span
              className={`naxatw-font-medium ${
                isLowCoverage
                  ? 'naxatw-text-yellow-600'
                  : 'naxatw-text-green-600'
              }`}
            >
              {coveragePercentage.toFixed(0)}%
            </span>
          </div>
        </div>
      </div>

      {/* Coverage Warning */}
      {isLowCoverage && (
        <div className="naxatw-absolute naxatw-bottom-4 naxatw-left-4 naxatw-right-4 naxatw-z-10 naxatw-rounded-lg naxatw-border naxatw-border-yellow-300 naxatw-bg-yellow-50 naxatw-p-3">
          <div className="naxatw-flex naxatw-items-center naxatw-gap-2">
            <span className="material-icons naxatw-text-yellow-600">
              warning
            </span>
            <div>
              <p className="naxatw-text-sm naxatw-font-medium naxatw-text-yellow-800">
                {m.task_verification_low_coverage_warning()}
              </p>
              <p className="naxatw-text-xs naxatw-text-yellow-700">
                {m.task_verification_low_coverage_body({
                  coverage: coveragePercentage.toFixed(0),
                })}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
