import { createSlice } from '@reduxjs/toolkit';
import type { CaseReducer, PayloadAction } from '@reduxjs/toolkit';
import { RasterSourceSpecification } from 'maplibre-gl';
import { GeojsonType } from '@Components/common/MapLibreComponents/types';
import persist from '@Store/persist';

export interface ProjectState {
  individualProjectActiveTab: string;
  // Task records are a large, backend-defined shape; consumers already
  // re-type individual items at each call site (e.g. `(task: Record<string,
  // any>) => ...`), so keep the array itself loose to match.
  tasksData: Record<string, any>[] | null;
  projectArea: GeojsonType | null;
  selectedTaskId: string;
  taskClickedOnTable: Record<string, any> | null;
  showGcpEditor: boolean;
  gcpData: unknown;
  visibleOrthophotoList: {
    taskId: string;
    source: RasterSourceSpecification;
  }[];
}

const initialState: ProjectState = {
  individualProjectActiveTab: 'about',
  tasksData: null,
  projectArea: null,
  selectedTaskId: '',
  taskClickedOnTable: null,
  showGcpEditor: false,
  gcpData: null,
  visibleOrthophotoList: [],
};

const setProjectState: CaseReducer<
  ProjectState,
  PayloadAction<Partial<Partial<ProjectState>>>
> = (state, action) => ({
  ...state,
  ...action.payload,
});

const projectSlice = createSlice({
  name: 'project',
  initialState,
  reducers: {
    setProjectState,
  },
});

export { projectSlice };

export default persist('common', [], projectSlice.reducer);
