import type { Feature, FeatureCollection, LineString } from 'geojson';

export default function reverseLineString(
  geojson: FeatureCollection | Feature | null | undefined,
) {
  const geometry = (
    geojson && 'features' in geojson ? geojson.features[0].geometry : geojson
  ) as LineString | undefined;
  if (!geometry) return geojson;
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {},
        geometry: {
          ...geometry,
          coordinates: [...geometry.coordinates].reverse(),
        },
      },
    ],
  };
}
