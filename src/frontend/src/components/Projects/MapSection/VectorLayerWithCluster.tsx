import { useEffect } from 'react';
import { MapMouseEvent, GeoJSONSource } from 'maplibre-gl';
import type { Point } from 'geojson';
import {
  MapInstanceType,
  GeojsonType,
} from '@Components/common/MapLibreComponents/types';

export default function VectorLayerWithCluster({
  map,
  visibleOnMap,
  mapLoaded,
  sourceId,
  geojson,
}: {
  map: MapInstanceType | null;
  visibleOnMap?: boolean;
  mapLoaded?: boolean;
  sourceId: string;
  geojson: GeojsonType | null;
}) {
  useEffect(() => {
    if (!map || !mapLoaded || !visibleOnMap || !sourceId) return undefined;

    // Ensure a basic OSM raster basemap is present so the map is never blank
    // when failing to load vector tiles
    if (!map.getSource('osm-raster')) {
      map.addSource('osm-raster', {
        type: 'raster',
        tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
        tileSize: 256,
        attribution: '© OpenStreetMap contributors',
      });
    }
    if (!map.getLayer('osm-raster')) {
      map.addLayer({
        id: 'osm-raster',
        type: 'raster',
        source: 'osm-raster',
      });
    }

    if (!map.getSource(sourceId)) {
      map.addSource(sourceId, {
        type: 'geojson',
        data: geojson ?? { type: 'FeatureCollection', features: [] },
        cluster: true,
        clusterMaxZoom: 14,
        clusterRadius: 40,
      });
    }

    if (!map.getLayer('clusters')) {
      map.addLayer({
        id: 'clusters',
        type: 'circle',
        source: sourceId,
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': '#D73F3F',
          'circle-radius': 15,
        },
      });
    }

    map.setGlyphs(
      'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
    );

    if (!map.getLayer('cluster-count')) {
      map.addLayer({
        id: 'cluster-count',
        type: 'symbol',
        source: sourceId,
        filter: ['has', 'point_count'],
        layout: {
          'text-field': '{point_count_abbreviated}',
          'text-size': 12,
        },
        paint: {
          'text-color': '#fff',
        },
      });
    }

    map.addLayer({
      id: 'unclustered-point',
      type: 'circle',
      source: sourceId,
      filter: ['!', ['has', 'point_count']],
      paint: {
        'circle-color': ['get', 'colorCode'],
        'circle-radius': 8,
        'circle-stroke-width': 1,
        'circle-stroke-color': '#fff',
      },
      layout: {},
    });

    // inspect a cluster on click
    map.on('click', 'clusters', async (e: MapMouseEvent) => {
      const features = map.queryRenderedFeatures(e.point, {
        layers: ['clusters'],
      });
      const clusterId = features[0].properties.cluster_id;
      const source = map.getSource(sourceId) as GeoJSONSource | undefined;
      const zoom = await source?.getClusterExpansionZoom(clusterId);
      map.easeTo({
        center: (features[0].geometry as Point).coordinates as [number, number],
        zoom,
      });
    });

    map.on('mouseenter', 'clusters', () => {
      // eslint-disable-next-line no-param-reassign -- mutating the MapLibre canvas cursor style is the standard pattern (see e.g. TaskVerificationModal); only flagged here because `map` happens to be a destructured prop
      map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', 'clusters', () => {
      // eslint-disable-next-line no-param-reassign
      map.getCanvas().style.cursor = '';
    });

    map.on('mouseenter', 'unclustered-point', () => {
      // eslint-disable-next-line no-param-reassign
      map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', 'unclustered-point', () => {
      // eslint-disable-next-line no-param-reassign
      map.getCanvas().style.cursor = '';
    });

    return () => {
      if (sourceId) {
        if (map.getLayer(sourceId)) {
          map.removeLayer(sourceId);
        }
        if (map.getLayer('clusters')) {
          map.removeLayer('clusters');
        }
        if (map.getLayer('unclustered-point')) {
          map.removeLayer('unclustered-point');
        }
        if (map.getLayer('cluster-count')) {
          map.removeLayer('cluster-count');
        }
      }
    };
  }, [geojson, map, mapLoaded, sourceId, visibleOnMap]);

  return null;
}
