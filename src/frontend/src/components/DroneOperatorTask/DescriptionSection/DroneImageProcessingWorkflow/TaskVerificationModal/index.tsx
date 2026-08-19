import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  Map as MapLibreMap,
  MapMouseEvent,
  NavigationControl,
  AttributionControl,
  LngLatBoundsLike,
  Popup,
} from 'maplibre-gl';
import bbox from '@turf/bbox';
import { AxiosError } from 'axios';
import { toast } from 'react-toastify';
import {
  getProjectTaskVerificationData,
  getTaskImageUrls,
  markTaskAsVerified,
  deleteTaskImage,
  TaskVerificationData,
  FlightGapDetectionData,
  getFlightGapDetectionData,
  ImageUrls,
  TaskImageData,
} from '@Services/classification';
import { setProjectState } from '@Store/actions/project';
import { useTypedDispatch, useTypedSelector } from '@Store/hooks';
import { TaskStateItem } from '@Services/project';
import { ProjectInfo, TaskOut } from '@Services/createproject';
import { m } from '@/paraglide/messages';
import FlightGapDetectionModal from '../FlightGapDetectionModal';
import TaskMapPanel from './TaskMapPanel';
import ImageSidebar from './ImageSidebar';
import VerificationFooter from './VerificationFooter';

interface TaskVerificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  taskId: string;
  taskIndex: number;
  onVerified?: () => void;
}

const TaskVerificationModal = ({
  isOpen,
  onClose,
  projectId,
  taskId,
  taskIndex,
  onVerified,
}: TaskVerificationModalProps) => {
  const queryClient = useQueryClient();
  const dispatch = useTypedDispatch();
  const tasksData = useTypedSelector(state => state.project.tasksData);
  const [map, setMap] = useState<MapLibreMap | null>(null);
  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const [isStyleReady, setIsStyleReady] = useState(false);
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [flightGapModal, setFlightGapModal] = useState<{
    isOpen: boolean;
    gapData: FlightGapDetectionData | null;
  }>({
    isOpen: false,
    gapData: null,
  });
  const popupRef = useRef<Popup | null>(null);
  const imageRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const hasFitRef = useRef(false);

  // Fetch task verification data (project-level, across all batches)
  const {
    data: verificationData,
    isLoading,
    refetch,
  } = useQuery<TaskVerificationData>({
    queryKey: ['taskVerification', projectId, taskId],
    queryFn: () => getProjectTaskVerificationData(projectId, taskId),
    enabled: isOpen && !!projectId && !!taskId,
  });

  // Fetch presigned image URLs on demand when modal opens
  const { data: imageUrlsData } = useQuery({
    queryKey: ['taskImageUrls', projectId, taskId],
    queryFn: () => getTaskImageUrls(projectId, taskId),
    enabled: isOpen && !!projectId && !!taskId,
    staleTime: 30 * 60 * 1000, // 30 min
  });

  // Build URL lookup map
  const imageUrlMap = useMemo(() => {
    const urlMap: Record<string, ImageUrls> = {};
    if (imageUrlsData?.images) {
      imageUrlsData.images.forEach(img => {
        urlMap[img.id] = img;
      });
    }
    return urlMap;
  }, [imageUrlsData?.images]);

  // Virtualized sidebar grid (2 columns)
  const SIDEBAR_COLS = 2;
  const SIDEBAR_ROW_H = 150;
  const sidebarParentRef = useRef<HTMLDivElement>(null);
  const sidebarRows = useMemo(() => {
    const images = verificationData?.images || [];
    const result: TaskImageData[][] = [];
    for (let i = 0; i < images.length; i += SIDEBAR_COLS) {
      result.push(images.slice(i, i + SIDEBAR_COLS));
    }
    return result;
  }, [verificationData?.images]);

  const sidebarVirtualizer = useVirtualizer({
    count: sidebarRows.length,
    getScrollElement: () => sidebarParentRef.current,
    estimateSize: () => SIDEBAR_ROW_H,
    overscan: 3,
  });

  // Reset map when modal closes
  useEffect(() => {
    if (!isOpen && map) {
      map.remove();
      setMap(null);
      setIsMapLoaded(false);
      setIsStyleReady(false);
      hasFitRef.current = false;
    }
    if (!isOpen) {
      setFlightGapModal({ isOpen: false, gapData: null });
    }
  }, [isOpen, map]);

  // Initialize map after data is loaded and DOM is ready
  useEffect(() => {
    if (!isOpen || !verificationData || map) return undefined;

    const timer = setTimeout(() => {
      const container = document.getElementById('task-verification-map');
      if (!container) {
        console.error('Map container not found');
        return;
      }

      const mapInstance = new MapLibreMap({
        container,
        style: { version: 8, sources: {}, layers: [] },
        center: [0, 0],
        zoom: 2,
        maxZoom: 22,
        attributionControl: false,
        renderWorldCopies: false,
      });

      mapInstance.on('load', () => {
        setIsMapLoaded(true);
        setTimeout(() => {
          if (mapInstance.getStyle()) {
            setIsStyleReady(true);
          }
        }, 100);
      });

      mapInstance.dragRotate.disable();
      mapInstance.touchZoomRotate.disableRotation();

      setMap(mapInstance);
    }, 100);

    return () => clearTimeout(timer);
  }, [isOpen, verificationData, map]);

  // Add map controls
  useEffect(() => {
    if (isMapLoaded && map) {
      map.addControl(new NavigationControl(), 'top-right');
      map.addControl(new AttributionControl({ compact: true }), 'bottom-right');
    }
  }, [isMapLoaded, map]);

  // Fit to task extent with appropriate zoom (not too close)
  useEffect(() => {
    if (
      !map ||
      !isMapLoaded ||
      !isStyleReady ||
      !verificationData?.task_geometry ||
      hasFitRef.current
    )
      return;
    hasFitRef.current = true;

    try {
      const geojson = {
        type: 'FeatureCollection' as const,
        features: [verificationData.task_geometry],
      };
      const [minLng, minLat, maxLng, maxLat] = bbox(geojson);
      map.fitBounds(
        [
          [minLng, minLat],
          [maxLng, maxLat],
        ] as LngLatBoundsLike,
        {
          padding: 60,
          maxZoom: 17,
          duration: 300,
        },
      );
    } catch {
      // ignore
    }
  }, [map, isMapLoaded, isStyleReady, verificationData]);

  // Pointer cursor + click handler on image points
  useEffect(() => {
    if (!map || !isMapLoaded) return undefined;

    const layerId = 'task-image-points-layer';

    const onMouseEnter = () => {
      map.getCanvas().style.cursor = 'pointer';
    };
    const onMouseLeave = () => {
      map.getCanvas().style.cursor = '';
    };

    const handleClick = (e: MapMouseEvent) => {
      const features = map.queryRenderedFeatures(e.point, {
        layers: [layerId],
      });
      if (!features?.length) return;

      const props = features[0].properties;
      const coords = (
        features[0].geometry as GeoJSON.Point
      ).coordinates.slice() as [number, number];

      // Close existing popup
      if (popupRef.current) {
        popupRef.current.remove();
      }

      const html = `
        <div style="min-width:160px;max-width:280px;font-family:system-ui,sans-serif;">
          <p style="font-size:13px;font-weight:600;margin-bottom:4px;word-break:break-all;">${props.filename}</p>
          <p style="font-size:12px;color:#555;text-transform:capitalize;">Status: ${(props.status || '').replace('_', ' ')}</p>
        </div>
      `;

      const newPopup = new Popup({
        closeButton: true,
        closeOnClick: false,
        offset: 12,
        anchor: 'bottom',
        maxWidth: '300px',
      })
        .setLngLat(coords)
        .setHTML(html)
        .addTo(map);

      popupRef.current = newPopup;

      // Highlight in sidebar
      setSelectedImageId(props.id);
      setTimeout(() => {
        const el = imageRefs.current[props.id];
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }, 100);
    };

    map.on('mouseenter', layerId, onMouseEnter);
    map.on('mouseleave', layerId, onMouseLeave);
    map.on('click', layerId, handleClick);

    return () => {
      map.off('mouseenter', layerId, onMouseEnter);
      map.off('mouseleave', layerId, onMouseLeave);
      map.off('click', layerId, handleClick);
      if (popupRef.current) {
        popupRef.current.remove();
        popupRef.current = null;
      }
    };
  }, [map, isMapLoaded]);

  // Update map highlight when selectedImageId changes
  useEffect(() => {
    if (!map || !isMapLoaded) return;

    const layerId = 'task-image-points-layer';

    try {
      if (!map.getLayer(layerId)) return;

      if (selectedImageId) {
        map.setPaintProperty(layerId, 'circle-stroke-width', [
          'case',
          ['==', ['get', 'id'], selectedImageId],
          4,
          2,
        ]);
        map.setPaintProperty(layerId, 'circle-stroke-color', [
          'case',
          ['==', ['get', 'id'], selectedImageId],
          '#2563eb',
          '#ffffff',
        ]);
        map.setPaintProperty(layerId, 'circle-radius', [
          'case',
          ['==', ['get', 'id'], selectedImageId],
          8,
          6,
        ]);
      } else {
        map.setPaintProperty(layerId, 'circle-stroke-width', 2);
        map.setPaintProperty(layerId, 'circle-stroke-color', '#ffffff');
        map.setPaintProperty(layerId, 'circle-radius', 6);
      }
    } catch {
      // Layer not ready yet
    }
  }, [map, isMapLoaded, selectedImageId]);

  // Convert images to GeoJSON for map display
  const imagesGeoJson = useCallback(() => {
    if (!verificationData?.images) return null;

    const features = verificationData.images
      .filter(img => img.location?.coordinates)
      .map(img => ({
        type: 'Feature' as const,
        properties: {
          id: img.id,
          filename: img.filename,
          status: img.status,
        },
        geometry: img.location,
      }));

    return {
      type: 'FeatureCollection' as const,
      features,
    };
  }, [verificationData]);

  // Mark as verified mutation
  const verifyMutation = useMutation({
    mutationFn: () => markTaskAsVerified(projectId, taskId),
    onSuccess: () => {
      const nextState = 'READY_FOR_PROCESSING';

      queryClient.setQueryData(
        ['project-task-states', projectId],
        (existing: unknown) => {
          if (Array.isArray(existing)) {
            return (existing as TaskStateItem[]).map(task =>
              task.task_id === taskId ? { ...task, state: nextState } : task,
            );
          }

          const existingObj = existing as { data?: unknown } | undefined;
          if (Array.isArray(existingObj?.data)) {
            return {
              ...existingObj,
              data: (existingObj.data as TaskStateItem[]).map(task =>
                task.task_id === taskId ? { ...task, state: nextState } : task,
              ),
            };
          }

          return existing;
        },
      );

      if (tasksData) {
        dispatch(
          setProjectState({
            tasksData: tasksData.map(task =>
              task.id === taskId
                ? {
                    ...task,
                    state: nextState,
                    outline: {
                      ...(task.outline as Record<string, unknown>),
                      properties: {
                        ...(
                          task.outline as {
                            properties?: Record<string, unknown>;
                          }
                        )?.properties,
                        state: nextState,
                      },
                    },
                  }
                : task,
            ),
          }),
        );
      }

      // Optimistically update project-detail cache so the Processing
      // button becomes available immediately (before the refetch lands).
      // Use setQueriesData (partial match) because the cache key may use
      // either the project UUID or a slug, depending on how the user navigated.
      queryClient.setQueriesData<unknown>(
        { queryKey: ['project-detail'] },
        (existing: unknown) => {
          const existingObj = existing as
            | { data?: ProjectInfo; tasks?: TaskOut[] }
            | undefined;
          const data = existingObj?.data ?? existingObj;
          if (data?.tasks && Array.isArray(data.tasks)) {
            const updatedTasks = data.tasks.map(task =>
              task.id === taskId ? { ...task, state: nextState } : task,
            );
            if (existingObj?.data) {
              return {
                ...existingObj,
                data: { ...data, tasks: updatedTasks },
              };
            }
            return { ...data, tasks: updatedTasks };
          }
          return existing;
        },
      );

      toast.success(m.task_verification_marked_ready({ taskIndex }));
      queryClient.invalidateQueries({ queryKey: ['taskVerification'] });
      queryClient.invalidateQueries({
        queryKey: ['project-task-states', projectId],
      });
      queryClient.invalidateQueries({ queryKey: ['projectReview', projectId] });
      queryClient.invalidateQueries({
        queryKey: ['projectMapData', projectId],
      });
      queryClient.invalidateQueries({ queryKey: ['project-detail'] });
      queryClient.invalidateQueries({
        queryKey: ['projectTaskImagerySummary', projectId],
      });
      queryClient.invalidateQueries({
        queryKey: ['all-task-assets-info', projectId],
      });
      onVerified?.();
      onClose();
    },
    onError: (error: AxiosError) => {
      const message =
        (error.response?.data as { detail?: string })?.detail ||
        error.message ||
        'Failed to verify task';
      toast.error(message);
    },
  });

  // Delete image mutation
  const deleteMutation = useMutation({
    mutationFn: (imageId: string) => deleteTaskImage(projectId, imageId),
    onSuccess: () => {
      toast.success(m.drone_task_image_deleted());
      refetch();
      setSelectedImageId(null);
    },
    onError: (error: AxiosError) => {
      const message =
        (error.response?.data as { detail?: string })?.detail ||
        error.message ||
        'Failed to delete image';
      toast.error(message);
    },
  });

  const flightGapAnalysisMutation = useMutation<
    FlightGapDetectionData,
    Error,
    void
  >({
    mutationFn: () => getFlightGapDetectionData(projectId, taskId),
    onSuccess: data => {
      setFlightGapModal({
        isOpen: true,
        gapData: data,
      });
    },
    onError: error => {
      toast.error(
        error.message || m.task_verification_flight_gap_analysis_failed(),
      );
    },
  });

  // Handle sidebar image click: highlight on map and fly to point
  const handleSidebarImageClick = (imageId: string) => {
    setSelectedImageId(imageId);

    if (map && verificationData?.images) {
      const img = verificationData.images.find(i => i.id === imageId);
      if (img?.location?.coordinates) {
        const coords = img.location.coordinates as [number, number];

        // Close existing popup
        if (popupRef.current) {
          popupRef.current.remove();
        }

        const html = `
          <div style="min-width:160px;max-width:280px;font-family:system-ui,sans-serif;">
            <p style="font-size:13px;font-weight:600;margin-bottom:4px;word-break:break-all;">${img.filename}</p>
            <p style="font-size:12px;color:#555;text-transform:capitalize;">Status: ${(img.status || '').replace('_', ' ')}</p>
          </div>
        `;

        const newPopup = new Popup({
          closeButton: true,
          closeOnClick: false,
          offset: 12,
          anchor: 'bottom',
          maxWidth: '300px',
        })
          .setLngLat(coords)
          .setHTML(html)
          .addTo(map);

        popupRef.current = newPopup;

        map.flyTo({
          center: coords,
          zoom: Math.max(map.getZoom(), 17),
          duration: 500,
        });
      }
    }
  };

  if (!isOpen) return null;

  const imageGeoJsonData = imagesGeoJson();
  const coveragePercentage = verificationData?.coverage_percentage ?? 0;
  const isLowCoverage = coveragePercentage < 100;
  const isAlreadyVerified = verificationData?.is_verified ?? false;

  return (
    <div className="naxatw-fixed naxatw-inset-0 naxatw-z-[9999] naxatw-flex naxatw-items-center naxatw-justify-center naxatw-bg-black naxatw-bg-opacity-50">
      <div className="naxatw-relative naxatw-flex naxatw-h-[90vh] naxatw-w-[90vw] naxatw-flex-col naxatw-rounded-lg naxatw-bg-white naxatw-shadow-xl">
        {/* Header */}
        <div className="naxatw-flex naxatw-items-center naxatw-justify-between naxatw-border-b naxatw-px-6 naxatw-py-4">
          <div>
            <h2 className="naxatw-text-xl naxatw-font-semibold naxatw-text-gray-800">
              {m.task_verification_title({ taskIndex })}
            </h2>
            <p className="naxatw-text-sm naxatw-text-gray-500">
              {m.task_verification_description()}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="naxatw-rounded-full naxatw-p-2 naxatw-text-gray-500 hover:naxatw-bg-gray-100"
          >
            <span className="material-icons">close</span>
          </button>
        </div>

        {/* Content */}
        <div className="naxatw-flex naxatw-flex-1 naxatw-overflow-hidden">
          {isLoading ? (
            <div className="naxatw-flex naxatw-flex-1 naxatw-items-center naxatw-justify-center">
              <div className="naxatw-flex naxatw-flex-col naxatw-items-center naxatw-gap-3">
                <div className="naxatw-h-8 naxatw-w-8 naxatw-animate-spin naxatw-rounded-full naxatw-border-4 naxatw-border-gray-200 naxatw-border-t-red" />
                <p className="naxatw-text-gray-500">
                  {m.task_verification_loading_task_data()}
                </p>
              </div>
            </div>
          ) : (
            <>
              <TaskMapPanel
                map={map}
                isMapLoaded={isMapLoaded}
                isStyleReady={isStyleReady}
                verificationData={verificationData}
                imageGeoJsonData={imageGeoJsonData}
                coveragePercentage={coveragePercentage}
                isLowCoverage={isLowCoverage}
              />

              <ImageSidebar
                imageCount={verificationData?.image_count || 0}
                sidebarParentRef={sidebarParentRef}
                sidebarVirtualizer={sidebarVirtualizer}
                sidebarRows={sidebarRows}
                imageUrlMap={imageUrlMap}
                selectedImageId={selectedImageId}
                imageRefs={imageRefs}
                onImageClick={handleSidebarImageClick}
                deleteMutation={deleteMutation}
              />
            </>
          )}
        </div>

        <VerificationFooter
          onClose={onClose}
          onFindFlightGaps={() => flightGapAnalysisMutation.mutate()}
          isFindingFlightGaps={flightGapAnalysisMutation.isPending}
          onVerify={() => verifyMutation.mutate()}
          isVerifying={verifyMutation.isPending}
          hasImages={Boolean(verificationData?.images.length)}
          isAlreadyVerified={isAlreadyVerified}
        />
      </div>

      <FlightGapDetectionModal
        isOpen={flightGapModal.isOpen}
        onClose={() => setFlightGapModal({ isOpen: false, gapData: null })}
        projectId={projectId}
        taskId={taskId}
        taskIndex={taskIndex}
        gapAnalysisData={flightGapModal.gapData}
      />
    </div>
  );
};

export default TaskVerificationModal;
