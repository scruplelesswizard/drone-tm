import type { DrawMode } from '@mapbox/mapbox-gl-draw';
import type {
  Feature,
  FeatureCollection,
  GeoJsonProperties,
  GeoJsonTypes,
} from 'geojson';
import type { Map, MapOptions } from 'maplibre-gl';
import type { ReactElement, ReactNode } from 'react';

export type MapInstanceType = Map;

export type MapOptionsType = {
  containerId?: string;
  mapOptions?: Partial<MapOptions>;
  enable3D?: boolean;
  disableRotation?: boolean;
};

export type IMapOptionsProps = Partial<MapOptionsType>;

export interface IMapContainer {
  children?: ReactNode;
  containerId?: string;
  map: MapInstanceType | null;
  isMapLoaded: boolean;
  style?: object;
}

export interface IBaseLayerSwitcher {
  map?: MapInstanceType | null;
  baseLayers?: object;
  activeLayer?: string;
  isMapLoaded?: boolean;
}

export interface ILayer {
  map?: MapInstanceType;
  isMapLoaded?: boolean;
  id: number | string;
  style?: object;
  layerOptions?: object;
  visibleOnMap?: boolean;
}

export type GeojsonType = GeoJsonTypes | FeatureCollection | Feature;

export interface IVectorLayer extends ILayer {
  geojson: GeojsonType | null;
  interactions?: string[];
  onFeatureSelect?: (properties: GeoJsonProperties) => void;
  hasImage?: boolean;
  image?: string;
  symbolPlacement?: 'point' | 'line' | 'line-center';
  iconAnchor?:
    | 'center'
    | 'left'
    | 'right'
    | 'top'
    | 'bottom'
    | 'top-left'
    | 'top-right'
    | 'bottom-left'
    | 'bottom-right';
  imageLayerOptions?: object;
  zoomToExtent?: boolean;
  // A plain snapshot of the MapMouseEvent's own enumerable fields at
  // drag time (spread, not the live event instance - no event methods).
  onDrag?: (
    e: Record<string, unknown> & {
      originalCoordinates: [number, number];
      isDragging: boolean;
    },
  ) => void;
  onDragEnd?: () => void;
  needDragEvent?: boolean;
  imageLayoutOptions?: object;
}

type InteractionsType = 'hover' | 'select';

export interface IVectorTileLayer extends ILayer {
  url: string;
  interactions?: InteractionsType[];
  onFeatureSelect?: (properties: GeoJsonProperties) => void;
}

export interface IAsyncPopup {
  map?: MapInstanceType;
  fetchPopupData?: (properties: GeoJsonProperties) => void;
  popupUI?: (properties: GeoJsonProperties) => ReactElement;
  title?: string;
  handleBtnClick?: (properties: GeoJsonProperties) => void;
  isLoading?: boolean;
  onClose?: () => void;
  buttonText?: string;
  hideButton?: boolean;
  getCoordOnProperties?: boolean;
  showPopup?: (clickedFeature: GeoJsonProperties) => boolean;
  hasSecondaryButton?: boolean;
  secondaryButtonText?: string;
  handleSecondaryBtnClick?: (properties: GeoJsonProperties) => void;
  openPopupFor?: GeoJsonProperties | null;
  popupCoordinate?: number[];
  closePopupOnButtonClick?: boolean;
}

export type DrawModeTypes = DrawMode | null | undefined;

export interface IUseDrawToolProps {
  map?: MapInstanceType | null;
  enable: boolean;
  drawMode: DrawModeTypes;
  geojson?: GeojsonType | null;
  styles: Record<string, unknown>[];
  onDrawEnd: (geojson: GeojsonType | null) => void;
}
