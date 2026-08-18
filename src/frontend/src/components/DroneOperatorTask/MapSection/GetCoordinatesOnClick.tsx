import { useEffect } from 'react';
import { LngLat, MapMouseEvent } from 'maplibre-gl';
import { useMap } from '../../common/MapLibreComponents/MapContext';

interface IGetCoordinatesOnClick {
  getCoordinates: (lngLat: LngLat) => void;
}

const GetCoordinatesOnClick = ({ getCoordinates }: IGetCoordinatesOnClick) => {
  const { map, isMapLoaded } = useMap();
  useEffect(() => {
    if (!map || !isMapLoaded) return () => {};
    map.getCanvas().style.cursor = 'crosshair';

    const handleClick = (e: MapMouseEvent) => {
      const latLng = e.lngLat;
      getCoordinates(latLng);
    };
    map.on('click', handleClick);

    return () => {
      map.getCanvas().style.cursor = '';
      map.off('click', handleClick);
    };
  }, [map, isMapLoaded, getCoordinates]);
  return null;
};

export default GetCoordinatesOnClick;
