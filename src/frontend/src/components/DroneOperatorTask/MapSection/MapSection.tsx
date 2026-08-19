/* eslint-disable no-underscore-dangle */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch } from 'react-redux';
import useTaskParams from '@Hooks/useTaskParams';
import { Feature, FeatureCollection, GeoJsonProperties, Point } from 'geojson';
import { toast } from 'react-toastify';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { GeoJSONSource, LngLatBoundsLike, Map } from 'maplibre-gl';
import { AxiosError, AxiosResponse } from 'axios';
import getBbox from '@turf/bbox';
import { point } from '@turf/helpers';
import { coordAll } from '@turf/meta';
import { useTypedSelector } from '@Store/hooks';
import { useGetTaskAssetsInfo, useGetTaskWaypointQuery } from '@Api/tasks';
import { postTaskWaypoint } from '@Services/tasks';
import { useMapLibreGLMap } from '@Components/common/MapLibreComponents';
import { GeojsonType } from '@Components/common/MapLibreComponents/types';
import BaseLayerSwitcherUI from '@Components/common/BaseLayerSwitcher';
import {
  getWaypointModeOptions,
  waypointUpperLimit,
  droneModelOptions,
} from '@Constants/taskDescription';
import {
  setRotationAngle as setFinalRotationAngle,
  setRotatedFlightPlan,
  setSelectedTakeOffPoint,
  setSelectedTakeOffPointOption,
  setTaskAreaPolygon,
  setTaskAssetsInformation,
  setWaypointMode,
  setDroneModel,
  setGimbalAngle,
} from '@Store/actions/droneOperatorTask';
import rotateGeoJSON from '@Utils/rotateGeojsonData';
import { findNearestCoordinate, swapFirstAndLast } from '@Utils/index';
import RotatingCircle from '@Components/common/RotationCue';
import marker from '@Assets/images/marker.png';
import right from '@Assets/images/rightArrow.png';
import hasErrorBoundary from '@Utils/hasErrorBoundary';
import { toggleModal } from '@Store/actions/common';
import { mapLayerIDs } from '@Constants/droneOperator';
import { Button } from '@Components/RadixComponents/Button';
import AsyncPopup from '@Components/common/MapLibreComponents/NewAsyncPopup';
import LocateUser from '@Components/common/MapLibreComponents/LocateUser';
import MapContainer from '@Components/common/MapLibreComponents/MapContainer';
import VectorLayer from '@Components/common/MapLibreComponents/Layers/VectorLayer';
import GetCoordinatesOnClick from './GetCoordinatesOnClick';
import ShowInfo from './ShowInfo';
import MissingDemModal from './MissingDemModal';
import MapControlsBar from './MapControlsBar';
import MapToolButtons from './MapToolButtons';
import { m } from '@/paraglide/messages';

interface ModifiedTaskWayPointsData {
  geojsonListOfPoints: GeojsonType;
  geojsonAsLineString: FeatureCollection;
  battery_warning?: boolean;
  estimated_flight_time_minutes?: number;
}

const MapSection = ({ className }: { className?: string }) => {
  const dispatch = useDispatch();
  const queryClient = useQueryClient();
  const { projectId, taskId, taskData } = useTaskParams();
  const [popupData, setPopupData] = useState<GeoJsonProperties>({});
  const [showFlightPlan, setShowFlightPlan] = useState(true);
  const [showTaskArea, setShowTaskArea] = useState(true);
  const [dragging, setDragging] = useState(false);
  const [isRotationEnabled, setIsRotationEnabled] = useState(false);
  const [rotationAngle, setRotationAngle] = useState(0);
  const [allowMissingDem, setAllowMissingDem] = useState(false);
  const [demWarningShown, setDemWarningShown] = useState(false);
  const [showMissingDemModal, setShowMissingDemModal] = useState(false);
  const [initialWaypointData, setInitialWaypointData] =
    useState<ModifiedTaskWayPointsData | null>();
  const [modifiedWaypointModeOptions, setModifiedWaypointModeOptions] =
    useState(getWaypointModeOptions());

  const centroidRef = useRef<[number, number]>(null);
  const takeOffPointRef = useRef<[number, number]>(null);

  const waypointMode = useTypedSelector(
    state => state.droneOperatorTask.waypointMode,
  );
  const droneModel = useTypedSelector(
    state => state.droneOperatorTask.droneModel,
  );
  const droneModelRef = useRef(droneModel);
  droneModelRef.current = droneModel;
  const gimbalAngle = useTypedSelector(
    state => state.droneOperatorTask.gimbalAngle,
  );
  const newTakeOffPoint = useTypedSelector(
    state => state.droneOperatorTask.selectedTakeOffPoint,
  );
  // const taskAssetsInformation = useTypedSelector(
  //   state => state.droneOperatorTask.taskAssetsInformation,
  // );
  const rotatedFlightPlanData = useTypedSelector(
    state => state.droneOperatorTask.rotatedFlightPlan,
  );
  const finalRotationAngle = useTypedSelector(
    state => state.droneOperatorTask.rotationAngle,
  );

  const { map, isMapLoaded } = useMapLibreGLMap({
    containerId: 'dashboard-map',
    mapOptions: {
      zoom: 5,
      center: [84.124, 28.3949],
      maxZoom: 19,
    },
    disableRotation: true,
  });

  const {
    // Query is still called for its cache-population side effect even
    // though the returned data isn't read directly in this component.
    data: _taskAssetsInformation,
    // isFetching: taskAssetsInfoLoading,
  } = useGetTaskAssetsInfo(projectId as string, taskId as string);

  // Don't regenerate the flightplan once processing has started - the
  // flight is done and the backend call is a waste of resources.
  // IMAGE_UPLOADED is intentionally excluded: partial uploads may still
  // need new flights. If a user needs to re-add photos to a processed
  // task, they must first reset the processing status.
  const taskState = taskData?.state;
  const isPostFlightState =
    taskState === 'IMAGE_PROCESSING_STARTED' ||
    taskState === 'IMAGE_PROCESSING_FINISHED' ||
    taskState === 'IMAGE_PROCESSING_FAILED';

  const {
    data: taskWayPointsData,
    isLoading: taskWayPointsLoading,
    isError: isTaskWaypointsError,
    error: taskWaypointsError,
  } = useGetTaskWaypointQuery(
    projectId as string,
    taskId as string,
    waypointMode as string,
    droneModel as string,
    finalRotationAngle,
    gimbalAngle as string,
    {
      enabled: !!(projectId && taskId) && !isPostFlightState,
      select: (res: unknown) => {
        const { data } = res as AxiosResponse<{
          results: GeojsonType;
          battery_warning?: boolean;
          estimated_flight_time_minutes?: number;
        }>;
        const modifiedTaskWayPointsData = {
          geojsonListOfPoints: data.results,
          geojsonAsLineString: {
            type: 'FeatureCollection',
            features: [
              {
                type: 'Feature',
                properties: {},
                geometry: {
                  type: 'LineString',
                  // get all coordinates
                  coordinates: coordAll(data.results as FeatureCollection),
                },
              },
            ],
          },
          battery_warning: data.battery_warning,
          estimated_flight_time_minutes: data.estimated_flight_time_minutes,
        };

        const firstPointGeometry = (
          modifiedTaskWayPointsData?.geojsonListOfPoints as FeatureCollection
        )?.features[0]?.geometry as { coordinates?: [number, number] };
        takeOffPointRef.current = firstPointGeometry?.coordinates as [
          number,
          number,
        ];
        return modifiedTaskWayPointsData;
      },
    },
    allowMissingDem,
  ) as {
    data?: ModifiedTaskWayPointsData;
    isLoading: boolean;
    isError: boolean;
    error: AxiosError | null;
  };

  useEffect(() => {
    if (!isTaskWaypointsError) {
      setDemWarningShown(false);
      return;
    }

    if (demWarningShown) {
      return;
    }

    const detail = (
      taskWaypointsError?.response?.data as
        | {
            detail?: string | { code?: string; message?: string };
          }
        | undefined
    )?.detail;
    const code = typeof detail === 'object' ? detail?.code : undefined;

    if (code === 'MISSING_TERRAIN_DEM') {
      setDemWarningShown(true);
      setShowMissingDemModal(true);
      return;
    }

    const message =
      (typeof detail === 'object' ? detail?.message : detail) ||
      taskWaypointsError?.message;
    toast.error(message || m.map_task_waypoints_generation_failed());
  }, [isTaskWaypointsError, taskWaypointsError, demWarningShown]);

  useEffect(() => {
    if (taskWayPointsData?.battery_warning) {
      const friendlyModelName = droneModelOptions.find(
        drone => drone.value === droneModelRef.current,
      )?.label;

      toast.warn(
        `The estimated flight time of ${taskWayPointsData.estimated_flight_time_minutes} minutes
         exceeds 80% of ${friendlyModelName}'s battery life. Consider splitting the task into smaller parts.`,
      );
    }
  }, [taskWayPointsData]);

  const { mutate: postWaypoint, isPending: isUpdatingTakeOffPoint } =
    useMutation<
      AxiosResponse,
      AxiosError,
      {
        taskId: string;
        projectId: string;
        mode: string;
        rotationAngle: number;
        droneModel: string;
        takeOffPoint: { longitude: number; latitude: number };
        gimbalAngle: string;
        allowMissingDem?: boolean;
      },
      unknown
    >({
      mutationFn: postTaskWaypoint,
      onSuccess: async () => {
        queryClient.invalidateQueries({ queryKey: ['task-waypoints'] });
        dispatch(setSelectedTakeOffPoint(null));
        dispatch(setSelectedTakeOffPointOption('current_location'));
      },
      onError: err => {
        const detail = (err.response?.data as { detail?: string })?.detail;
        toast.error(detail || err.message);
        dispatch(setSelectedTakeOffPoint(null));
      },
    });

  const taskDataPolygon = useMemo(() => {
    const geometry = (
      taskData?.outline as { geometry?: { coordinates: unknown } }
    )?.geometry;
    if (!geometry) return null;

    return {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: {
            type: 'Polygon',
            coordinates: geometry.coordinates,
          },
          properties: {},
        },
      ],
    };
  }, [taskData]);
  const taskDataPolygonIsFetching = !taskDataPolygon;

  useEffect(() => {
    if (taskDataPolygon) {
      dispatch(setTaskAreaPolygon(taskDataPolygon));
    }
  }, [taskDataPolygon, dispatch]);

  useEffect(() => {
    if (taskDataPolygon && map) {
      const layers = map.getStyle()?.layers;
      if (layers && layers.length > 0) {
        const firstLayerId = layers[4]?.id; // Get the first layer
        if (firstLayerId) {
          map.moveLayer('task-polygon-layer', firstLayerId); // Move the layer before the first layer
        }
      }
    }
  }, [taskDataPolygon, map]);

  useEffect(() => {
    if (!map || !isMapLoaded || (!taskWayPointsData && !taskDataPolygon))
      return;

    if (taskWayPointsData) {
      const bbox = getBbox(
        taskWayPointsData.geojsonAsLineString as FeatureCollection,
      ) as LngLatBoundsLike;
      map?.fitBounds(bbox as LngLatBoundsLike, {
        padding: 105,
        duration: 500,
      });
      return;
    }
    if (taskDataPolygon) {
      const bbox = getBbox(
        taskDataPolygon as FeatureCollection,
      ) as LngLatBoundsLike;
      map?.fitBounds(bbox as LngLatBoundsLike, {
        padding: 105,
        duration: 500,
      });
    }
  }, [map, isMapLoaded, taskWayPointsData, taskDataPolygon]);

  // rotation***start**************************
  const rotateLayerGeoJSON = (
    layerIds: string[],
    rotationDegreeParam: number,
    baseLayerIds: string[],
    excludeFirstFeature?: boolean,
  ) => {
    if (!map || !isMapLoaded) return;

    baseLayerIds.forEach((baseLayerId, index) => {
      const source = map?.getSource(baseLayerId);
      const sourceToRotate = map?.getSource(layerIds[index]);

      if (source && source instanceof GeoJSONSource) {
        const baseGeoData = source._data;
        if (!baseGeoData) return;
        const [firstFeature, ...restFeatures] = (
          baseGeoData as FeatureCollection
        ).features;
        if (firstFeature.geometry.type === 'Point') {
          const pointRotatedGeoJson = rotateGeoJSON(
            // @ts-expect-error spread baseGeoData object does not satisfy rotateGeoJSON's expected GeoJSON input type exactly
            {
              ...(baseGeoData as object),
              features: excludeFirstFeature
                ? restFeatures
                : [firstFeature, ...restFeatures],
            },
            rotationDegreeParam,
            centroidRef.current,
          );
          if (sourceToRotate && sourceToRotate instanceof GeoJSONSource) {
            sourceToRotate.setData(pointRotatedGeoJson);
          }
        }
        if (firstFeature.geometry.type === 'LineString') {
          const [firstCoordinate, ...restCoordinates] =
            firstFeature.geometry.coordinates;
          const rotatedGeoJson = rotateGeoJSON(
            {
              features: [
                // @ts-expect-error inline Feature object literal does not satisfy the full GeoJSON Feature type here
                {
                  type: 'Feature',
                  geometry: {
                    type: 'LineString',
                    coordinates: excludeFirstFeature
                      ? restCoordinates
                      : [firstCoordinate, ...restCoordinates],
                  },
                },
              ],
              type: 'FeatureCollection',
            },
            rotationDegreeParam,
            centroidRef.current,
          );
          if (sourceToRotate && sourceToRotate instanceof GeoJSONSource) {
            sourceToRotate.setData(rotatedGeoJson);
          }
        }
      }
    });
  };

  function updateLayerCoordinates(
    layerIds: { id: string; type: string }[],
    coordinate: [number, number],
  ) {
    // Iterate over the array of layer IDs
    if (!map || !isMapLoaded) return;
    layerIds.forEach(layerId => {
      // Check if the layer is of type 'symbol' (or any other type)
      const source = map.getSource(layerId.id); // Get the source of the layer

      // Update the feature on the map

      if (source && source instanceof GeoJSONSource) {
        const geoJsonData = source._data;
        // @ts-expect-error source._data is maplibre-gl's internal/undocumented field, untyped beyond unknown
        const { features, ...restGeoData } = geoJsonData;
        // eslint-disable-next-line prefer-destructuring
        const coordinates = features[0].geometry.coordinates;
        if (layerId.type === 'MultiString') {
          const nearestCoordinate = findNearestCoordinate(
            coordinates[0],
            coordinates[coordinates.length - 1],
            takeOffPointRef.current || [0, 0],
          );
          let indexToReplace = 0;
          if (nearestCoordinate === 'second') {
            indexToReplace = coordinates.length;
          }
          features[0].geometry.coordinates[indexToReplace] = coordinate;
          const updatedLineStringData = features[0].geometry.coordinates;
          if (indexToReplace !== 0) {
            updatedLineStringData.reverse().pop();
          }
          source.setData({ features, ...restGeoData });
        }
        if (layerId.type === 'Points') {
          const nearestPoint = findNearestCoordinate(
            coordinates,
            features[features.length - 1].geometry.coordinates,
            takeOffPointRef.current || [0, 0],
          );
          let pointIndexToReplace = 0;
          if (nearestPoint === 'second') {
            pointIndexToReplace = features.length;
          }
          if (pointIndexToReplace !== 0) {
            features.push({
              type: 'Feature',
              geometry: {
                type: 'Point',
                coordinates: [],
              },
              properties: {},
            });
          }
          features[pointIndexToReplace].geometry.coordinates = coordinate;
          const rotatedFeatures = features;
          if (pointIndexToReplace !== 0) {
            swapFirstAndLast(rotatedFeatures);
            features.pop();
          }
          source.setData({ features, ...restGeoData });
        }
      }
    });
  }

  useEffect(() => {
    if (rotationAngle === finalRotationAngle) return;

    if (!dragging) {
      rotateLayerGeoJSON(
        ['waypoint-line', 'waypoint-points'],
        rotationAngle - finalRotationAngle,
        ['waypoint-line', 'waypoint-points'],
        false,
      );
      updateLayerCoordinates(
        [
          { id: 'waypoint-line', type: 'MultiString' },
          { id: 'waypoint-points', type: 'Points' },
        ],
        takeOffPointRef.current || [0, 0],
      );

      return;
    }

    rotateLayerGeoJSON(
      ['rotated-waypoint-line', 'rotated-waypoint-points'],
      rotationAngle - finalRotationAngle,
      ['waypoint-line', 'waypoint-points'],
      true,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rotationAngle, dragging]);

  useEffect(() => {
    if (!taskWayPointsData) {
      return;
    }

    const numberOfFeatures =
      (taskWayPointsData?.geojsonListOfPoints as FeatureCollection | undefined)
        ?.features.length ?? 0;

    if (numberOfFeatures > waypointUpperLimit) {
      setModifiedWaypointModeOptions(prevOptions =>
        prevOptions.map(option => {
          if (option.label === 'Waypoints') {
            return {
              icon: 'info',
              message: `> 200 waypoints detected. If you are using a DJI RC-2 controller or low-spec device with RC-N2,
                then Waylines mode is recommended to avoid device input lag and delay due to an excessive number of waypoints.`,
              ...option,
            };
          }
          return option;
        }),
      );
    }
  }, [taskWayPointsData]);

  useEffect(() => {
    if (!taskWayPointsData || initialWaypointData) return;
    setInitialWaypointData(taskWayPointsData);
  }, [initialWaypointData, taskWayPointsData]);

  // to set bulk of ids (waypoint, way line and arrow symbols )
  function setVisibilityOfLayers(layerIds: string[], visibility: string) {
    layerIds.forEach(layerId => {
      if (map?.getLayer(layerId)) {
        map?.setLayoutProperty(layerId, 'visibility', visibility);
      }
    });
  }

  useEffect(() => {
    if (!map || !isMapLoaded) return;

    if (!dragging) {
      setVisibilityOfLayers(mapLayerIDs, 'visible');
      if (rotationAngle !== finalRotationAngle)
        dispatch(setFinalRotationAngle(rotationAngle));
      return;
    }
    setVisibilityOfLayers(mapLayerIDs, 'none');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragging, isMapLoaded, map]);

  useEffect(() => {
    if (!taskWayPointsData) return;
    dispatch(
      setRotatedFlightPlan({
        geojsonListOfPoints: taskWayPointsData.geojsonListOfPoints,
        geojsonAsLineString: taskWayPointsData.geojsonAsLineString,
      }),
    );
  }, [taskWayPointsData, dispatch]);

  // *********rotation end *******************

  const getPopupUI = useCallback(() => {
    const lat = popupData?.coordinates?.lat?.toFixed(8);
    const lng = popupData?.coordinates?.lng?.toFixed(8);
    const isTakeOffPoint = popupData?.index === 0;
    const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;

    return (
      <div>
        <center>
          <h3>{popupData?.index}</h3>
          <div className="naxatw-flex naxatw-items-center naxatw-justify-center naxatw-gap-1">
            <p>
              {lat},&nbsp;{lng}
            </p>
            <span
              id="copy-coords-btn"
              data-coords={`${lat}, ${lng}`}
              className="naxatw-cursor-pointer naxatw-rounded naxatw-p-0.5 hover:naxatw-bg-grey-200"
              title={m.drone_task_popup_copy_coordinates()}
            >
              <i
                className="material-symbols-outlined"
                style={{ fontSize: '16px' }}
              >
                content_copy
              </i>
            </span>
            {isTakeOffPoint && (
              <span
                id="download-gpx-btn"
                data-lat={lat}
                data-lng={lng}
                className="naxatw-cursor-pointer naxatw-rounded naxatw-p-0.5 hover:naxatw-bg-grey-200"
                title={m.drone_task_popup_download_coordinates()}
              >
                <i
                  className="material-symbols-outlined"
                  style={{ fontSize: '16px' }}
                >
                  download
                </i>
              </span>
            )}
          </div>
        </center>
        <div className="naxatw-flex naxatw-flex-col naxatw-gap-2">
          <p className="naxatw-text-base">
            {m.drone_task_popup_speed_label()} {popupData?.speed} m/s
          </p>
          {popupData?.elevation && (
            <p className="naxatw-text-base">
              {m.drone_task_popup_elevation_label()} {popupData?.elevation}{' '}
              meter
            </p>
          )}
          <p className="naxatw-text-base">
            {m.drone_task_popup_take_photo_label()}{' '}
            {popupData?.take_photo ? m.common_yes() : m.common_no()}
          </p>
          <p className="naxatw-text-base">
            {m.drone_task_gimbal_angle_label()}: {popupData?.gimbal_angle}{' '}
            degree
          </p>
          <p className="naxatw-text-base">
            {m.drone_task_popup_heading_label()} {popupData?.heading}
          </p>
          {popupData?.altitude && (
            <p className="naxatw-text-base">
              {m.drone_task_altitude_label()}: {popupData?.altitude} meter
            </p>
          )}
          {isTakeOffPoint && (
            <a
              href={googleMapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="naxatw-flex naxatw-items-center naxatw-justify-center naxatw-gap-1 naxatw-rounded naxatw-bg-red naxatw-px-3 naxatw-py-1.5 naxatw-text-sm naxatw-text-white naxatw-no-underline hover:naxatw-opacity-80"
            >
              <i
                className="material-symbols-outlined"
                style={{ fontSize: '16px' }}
              >
                map
              </i>
              {m.drone_task_popup_open_google_maps()}
            </a>
          )}
        </div>
      </div>
    );
  }, [popupData]);

  // attach click handler for copy-coords button in popup (rendered via renderToString)
  // sibling button to download coordinates as a gpx file
  useEffect(() => {
    function handleCopyCoords(e: MouseEvent) {
      const btn = (e.target as HTMLElement).closest('#copy-coords-btn');
      if (!btn) return;
      const coords = btn.getAttribute('data-coords');
      if (coords) {
        navigator.clipboard.writeText(coords);
        toast.success(m.drone_task_popup_coordinates_copied());
      }
    }
    function handleDownloadGpx(e: MouseEvent) {
      const btn = (e.target as HTMLElement).closest('#download-gpx-btn');
      if (!btn) return;
      const lat = btn.getAttribute('data-lat');
      const lng = btn.getAttribute('data-lng');
      if (!lat || !lng) return;
      const gpx = `<?xml version="1.0" encoding="UTF-8"?>
      <gpx version="1.1" creator="DroneTM" xmlns="http://www.topografix.com/GPX/1/1">
        <wpt lat="${lat}" lon="${lng}">
          <name>Takeoff Point</name>
        </wpt>
      </gpx>`;

      const blob = new Blob([gpx], { type: 'application/gpx+xml' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'takeoff-point.gpx';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      toast.success(m.drone_task_popup_coordinates_downloaded());
    }
    document.addEventListener('click', handleCopyCoords);
    document.addEventListener('click', handleDownloadGpx);
    return () => {
      document.removeEventListener('click', handleCopyCoords);
      document.removeEventListener('click', handleDownloadGpx);
    };
  }, []);

  // toggle layers

  function handleRotationToggle() {
    if (!map || !isMapLoaded) return;
    setIsRotationEnabled(!isRotationEnabled);
  }

  const handleToggleFlightPlan = () => {
    if (!map || !isMapLoaded) return;
    setVisibilityOfLayers(
      mapLayerIDs,
      `${!showFlightPlan ? 'visible' : 'none'}`,
    );
    setShowFlightPlan(!showFlightPlan);
  };

  const handleToggleTaskArea = () => {
    map?.setLayoutProperty(
      'task-polygon-layer',
      'visibility',
      showTaskArea ? 'none' : 'visible',
    );
    setShowTaskArea(!showTaskArea);

    if (taskDataPolygon && !showTaskArea && map) {
      const bbox = getBbox(
        taskDataPolygon as FeatureCollection,
      ) as LngLatBoundsLike;
      map?.fitBounds(bbox as LngLatBoundsLike, {
        padding: 105,
        duration: 500,
      });
    }
  };

  // end toggle layers

  const zoomToExtent = () => {
    if (taskWayPointsData) {
      const bbox = getBbox(
        taskWayPointsData.geojsonAsLineString as FeatureCollection,
      ) as LngLatBoundsLike;
      map?.fitBounds(bbox as LngLatBoundsLike, {
        padding: 105,
        duration: 500,
      });
    }
  };

  const handleSaveStartingPoint = () => {
    const { geometry: startingPonyGeometry } =
      newTakeOffPoint as Feature<Point>;
    const [lng, lat] = startingPonyGeometry.coordinates;
    postWaypoint({
      projectId,
      taskId,
      mode: waypointMode,
      rotationAngle: finalRotationAngle,
      droneModel,
      allowMissingDem,
      takeOffPoint: {
        longitude: lng,
        latitude: lat,
      },
      gimbalAngle,
    });
  };

  // Clean up on unmount
  useEffect(
    () => () => {
      dispatch(setSelectedTakeOffPoint(null));
      dispatch(setSelectedTakeOffPointOption('current_location'));
      dispatch(setFinalRotationAngle(0));
      dispatch(
        setTaskAssetsInformation({
          total_image_uploaded: 0,
          assets_url: '',
          state: '',
        }),
      );
    },
    [dispatch],
  );

  return (
    <div
      className={`naxatw-relative naxatw-h-[calc(100vh-180px)] naxatw-w-full naxatw-rounded-xl naxatw-bg-gray-200 ${className}`}
    >
      <MissingDemModal
        show={showMissingDemModal}
        onCancel={() => {
          setShowMissingDemModal(false);
          toast.warn(m.drone_task_missing_dem_canceled());
        }}
        onGenerateAnyway={() => {
          setShowMissingDemModal(false);
          setAllowMissingDem(true);
        }}
      />

      <MapContainer
        map={map}
        isMapLoaded={isMapLoaded}
        containerId="dashboard-map"
        style={{
          width: '100%',
          height: '100%',
        }}
      >
        <BaseLayerSwitcherUI />
        <LocateUser />

        <VectorLayer
          map={map as Map}
          id="task-polygon"
          visibleOnMap={!!taskDataPolygon && !taskDataPolygonIsFetching}
          geojson={taskDataPolygon as GeojsonType}
          interactions={['feature']}
          layerOptions={{
            type: 'fill',
            paint: {
              'fill-color': '#98BBC8',
              'fill-outline-color': '#484848',
              'fill-opacity': 0.6,
            },
          }}
        />

        {/* task waypoints/way lines plot */}
        {/* render line, points and image (only if index is 0)  */}
        {taskWayPointsData &&
          !taskWayPointsLoading && [
            <VectorLayer
              key="waypoint-line"
              id="waypoint-line"
              geojson={taskWayPointsData?.geojsonAsLineString as GeojsonType}
              visibleOnMap={!!taskWayPointsData}
              layerOptions={{
                type: 'line',
                paint: {
                  'line-color': '#000000',
                  'line-width': 1,
                  'line-dasharray': [6, 3],
                },
              }}
              hasImage
              image={right}
              symbolPlacement="line"
              iconAnchor="center"
            />,
            <VectorLayer
              key="waypoint-points"
              id="waypoint-points"
              geojson={taskWayPointsData?.geojsonListOfPoints as GeojsonType}
              visibleOnMap={!!taskWayPointsData}
              interactions={['feature']}
              layerOptions={{
                type: 'circle',
                paint: {
                  'circle-color': '#176149',
                  'circle-stroke-width': 2,
                  'circle-stroke-color': 'red',
                  'circle-stroke-opacity': 1,
                  'circle-opacity': [
                    'match',
                    ['get', 'index'],
                    0,
                    0,
                    Number(
                      ((
                        taskWayPointsData?.geojsonListOfPoints as
                          | FeatureCollection
                          | undefined
                      )?.features?.length ?? 0) - 1,
                    ),
                    0,
                    1,
                  ],
                },
              }}
            />,
            <VectorLayer
              key="waypoint-points-image"
              id="waypoint-points-image"
              geojson={taskWayPointsData?.geojsonListOfPoints as GeojsonType}
              visibleOnMap={!!taskWayPointsData}
              layerOptions={{}}
              hasImage
              image={marker}
              iconAnchor="bottom"
              imageLayerOptions={{
                filter: ['==', 'index', 0],
              }}
            />,
          ]}

        {/* end of waypoint/way line plot */}

        {/* Visible only on rotation */}
        {isRotationEnabled && dragging && (
          <>
            {/* render line */}
            <VectorLayer
              map={map as Map}
              isMapLoaded={isMapLoaded}
              id="rotated-waypoint-line"
              geojson={
                rotatedFlightPlanData?.geojsonAsLineString as GeojsonType
              }
              visibleOnMap={!!taskWayPointsData}
              layerOptions={{
                type: 'line',
                paint: {
                  'line-color': '#000000',
                  'line-width': 1,
                  'line-dasharray': [6, 3],
                },
              }}
              hasImage
              image={right}
              symbolPlacement="line"
              iconAnchor="center"
            />
            {/* render points */}
            <VectorLayer
              map={map as Map}
              isMapLoaded={isMapLoaded}
              id="rotated-waypoint-points"
              geojson={
                rotatedFlightPlanData?.geojsonListOfPoints as GeojsonType
              }
              visibleOnMap={!!taskWayPointsData}
              interactions={['feature']}
              layerOptions={{
                type: 'circle',
                paint: {
                  'circle-color': '#176149',
                  'circle-stroke-width': 2,
                  'circle-stroke-color': 'red',
                  'circle-stroke-opacity': 1,
                  'circle-opacity': [
                    'match',
                    ['get', 'index'],
                    0,
                    0,
                    Number(
                      ((
                        rotatedFlightPlanData?.geojsonListOfPoints as
                          | FeatureCollection
                          | undefined
                      )?.features?.length ?? 0) - 1,
                    ),
                    0,
                    1,
                  ],
                },
              }}
            />
          </>
        )}

        {/* rotation ends */}

        {/* Update take off point */}
        <div className="naxatw-absolute naxatw-bottom-3 naxatw-right-[calc(50%-5.4rem)] naxatw-z-30 naxatw-h-fit lg:naxatw-right-3 lg:naxatw-top-3">
          <Button
            withLoader
            leftIcon="place"
            className="naxatw-w-[11.8rem] naxatw-bg-red"
            onClick={() => {
              if (newTakeOffPoint) {
                handleSaveStartingPoint();
              } else {
                dispatch(toggleModal('update-flight-take-off-point'));
              }
            }}
            isLoading={isUpdatingTakeOffPoint}
          >
            {newTakeOffPoint ? m.task_takeoff_save() : m.task_takeoff_change()}
          </Button>
        </div>
        {newTakeOffPoint && (
          <VectorLayer
            map={map as Map}
            isMapLoaded={isMapLoaded}
            id="new-take-Off-Point"
            geojson={newTakeOffPoint as GeojsonType}
            visibleOnMap
            layerOptions={{}}
            hasImage
            image={marker}
            iconAnchor="bottom"
          />
        )}

        {newTakeOffPoint === 'place_on_map' && (
          <GetCoordinatesOnClick
            getCoordinates={coordinates =>
              dispatch(
                setSelectedTakeOffPoint(
                  point([coordinates.lng, coordinates.lat]),
                ),
              )
            }
          />
        )}

        {newTakeOffPoint === 'place_on_map' && (
          <ShowInfo
            heading={m.task_takeoff_choose_starting_point()}
            message={m.task_takeoff_choose_on_map_help()}
          />
        )}
        {/* Update take off end */}

        {/* rotating tool */}
        {isRotationEnabled && (
          <div className="naxatw-absolute naxatw-bottom-10 naxatw-right-[calc(50%-5.4rem)] naxatw-z-30 lg:naxatw-right-2 lg:naxatw-top-10">
            <RotatingCircle
              setRotation={setRotationAngle}
              rotation={rotationAngle}
              dragging={dragging}
              setDragging={setDragging}
            />
          </div>
        )}

        {isRotationEnabled && (
          <div className="naxatw-absolute naxatw-bottom-3 naxatw-right-[calc(50%-5.4rem)] naxatw-z-30 naxatw-h-fit lg:naxatw-right-3 lg:naxatw-top-3">
            <Button
              withLoader
              leftIcon="rotate_90_degrees_cw"
              className="naxatw-w-[11.8rem] naxatw-bg-red"
              onClick={() => {
                setIsRotationEnabled(false);
              }}
              isLoading={isUpdatingTakeOffPoint}
            >
              {m.drone_task_save_rotation()}
            </Button>
          </div>
        )}

        {/* rotating tool end */}

        <AsyncPopup
          map={map as Map}
          showPopup={(feature: GeoJsonProperties) =>
            feature?.source === 'waypoint-points' ||
            feature?.source === 'waypoint-points-image'
          }
          popupUI={getPopupUI}
          fetchPopupData={(properties: GeoJsonProperties) => {
            setPopupData(properties);
          }}
          hideButton
          getCoordOnProperties
        />

        <MapControlsBar
          droneModel={droneModel}
          onDroneModelChange={value => dispatch(setDroneModel(value))}
          gimbalAngle={gimbalAngle}
          onGimbalAngleChange={value => dispatch(setGimbalAngle(value.value))}
          waypointMode={waypointMode}
          waypointModeOptions={modifiedWaypointModeOptions}
          onWaypointModeChange={value => dispatch(setWaypointMode(value.value))}
        />

        {/* additional controls */}
        <MapToolButtons
          isRotationEnabled={isRotationEnabled}
          onToggleRotation={() => handleRotationToggle()}
          showFlightPlan={showFlightPlan}
          onToggleFlightPlan={() => handleToggleFlightPlan()}
          showTaskArea={showTaskArea}
          onToggleTaskArea={() => handleToggleTaskArea()}
          onZoomToExtent={() => zoomToExtent()}
        />
      </MapContainer>
    </div>
  );
};

export default hasErrorBoundary(MapSection);
