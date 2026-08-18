/* eslint-disable no-param-reassign */
import { useEffect, useMemo, useRef } from 'react';
import { Map, Popup } from 'maplibre-gl';
import type { FeatureCollection } from 'geojson';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import StaticMode from '@mapbox/mapbox-gl-draw-static-mode';
import length from '@turf/length';
import area from '@turf/area';
import centroid from '@turf/centroid';
import { measureStyles } from '@Constants/map';

export interface IMeasureToolProps {
  map?: Map | null;
  isMapLoaded?: boolean;
  enable: boolean;
  measureType: 'length' | 'area' | null;
  onDrawChange?: (props: { measurement: number; unit: string }) => void;
  onDrawComplete?: (data: FeatureCollection) => void;
}

const { modes } = MapboxDraw;
// @ts-expect-error MapboxDraw modes object types only its built-in modes, not custom ones like this
modes.static = StaticMode;

const popup = new Popup({
  closeButton: false,
  closeOnClick: false,
  className: 'measure-tooltip',
});

export default function MeasureTool({
  map,
  isMapLoaded,
  enable = false,
  measureType = 'length',
  onDrawChange,
  onDrawComplete,
}: IMeasureToolProps) {
  const isMeasureCompleted = useRef(false);

  const draw = useMemo(
    () =>
      new MapboxDraw({
        displayControlsDefault: false,
        defaultMode: 'draw_polygon',
        // @ts-expect-error MapboxDraw modes object types only its built-in modes, not custom ones like this
        modes,
        styles: measureStyles,
        drawControl: true,
      }),
    [],
  );

  useEffect(() => {
    // @ts-expect-error @mapbox/mapbox-gl-draw types are written for mapbox-gl, not maplibre-gl - IControl shapes are structurally similar but not identical
    if (!map || !isMapLoaded || !enable || map.hasControl(draw))
      return () => {};
    // @ts-expect-error @mapbox/mapbox-gl-draw types are written for mapbox-gl, not maplibre-gl - IControl shapes are structurally similar but not identical
    map.addControl(draw);
    draw.changeMode(
      // @ts-expect-error draw_line_string/draw_polygon are valid MapboxDraw mode names but not part of its narrower built-in DrawMode type
      measureType === 'length' ? 'draw_line_string' : 'draw_polygon',
    );
    return () => {
      // @ts-expect-error @mapbox/mapbox-gl-draw types are written for mapbox-gl, not maplibre-gl - IControl shapes are structurally similar but not identical
      map.removeControl(draw);
      isMeasureCompleted.current = false;
      popup.remove();
    };
  }, [map, isMapLoaded, enable, draw, measureType]);

  useEffect(() => {
    if (!map || !enable) return () => {};
    function handleDrawRender() {
      const data = draw.getAll();
      const geomType = data.features[0].geometry.type;
      const measurement =
        geomType === 'LineString'
          ? length(data, { units: 'meters' })
          : area(data);
      if (!measurement || !map) return;
      onDrawChange?.({
        measurement,
        unit: geomType === 'LineString' ? 'm' : 'm²',
      });
      onDrawComplete?.(data);
      if (geomType === 'Polygon') {
        const centroidGeojson = centroid(data);
        const { coordinates } = centroidGeojson.geometry;
        if (!coordinates) return;
        popup
          .setLngLat(coordinates as [number, number])
          .setHTML(`${measurement.toFixed(2)} m².`)
          .addTo(map);
      }
      if (geomType === 'LineString') {
        const { coordinates } = data.features[0].geometry;
        const lastPoint = coordinates[coordinates.length - 1];
        if (!lastPoint) return;
        popup
          .setLngLat(lastPoint as [number, number])
          .setHTML(`${measurement.toFixed(2)} m.`)
          .addTo(map);
      }
    }
    map.on('draw.render', handleDrawRender);
    return () => {
      map.off('draw.render', handleDrawRender);
    };
  }, [map, draw, enable]); // eslint-disable-line

  useEffect(() => {
    if (!map || !enable) return () => {};
    function handleDrawCreate() {
      if (!map) return;
      isMeasureCompleted.current = true;
    }
    map.on('draw.create', handleDrawCreate);
    return () => {
      map.off('draw.create', handleDrawCreate);
      isMeasureCompleted.current = false;
    };
  }, [map, draw, enable]);

  useEffect(() => {
    if (!map || !enable) return () => {};
    const handleMouseMove = () => {
      if (!map) return;
      if (isMeasureCompleted.current) {
        map.getCanvas().style.cursor = '';
      } else {
        map.getCanvas().style.cursor = 'crosshair';
      }
    };
    map.on('mousemove', handleMouseMove);
    return () => {
      map.off('mousemove', handleMouseMove);
      map.getCanvas().style.cursor = '';
    };
  }, [map, enable]);

  return null;
}
