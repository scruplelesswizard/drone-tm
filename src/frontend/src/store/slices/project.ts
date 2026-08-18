import { createSlice } from '@reduxjs/toolkit';
import type { CaseReducer, PayloadAction } from '@reduxjs/toolkit';
import { RasterSourceSpecification } from 'maplibre-gl';
import { GeojsonType } from '@Components/common/MapLibreComponents/types';
import { TaskOut } from '@Services/createproject';
import persist from '@Store/persist';

// tasksData is projectData.tasks (TaskOut[]) with each task's outline
// reshaped into a loose GeoJSON-feature-like bag whose properties carry
// the current lock info (see views/IndividualProject/index.tsx and
// RegulatorsApprovalPage/index.tsx) - not a strict Feature since the
// reshape only ever sets `properties`, not `type`/`geometry`.
export interface TaskData extends Omit<TaskOut, 'outline'> {
  outline: Record<string, unknown> | null;
}

// Set on row click in Tasks/TableSection - not a backend shape, just the
// fields IndividualProject/MapSection needs to open a popup for that task.
export interface TaskClickedOnTable {
  id?: string;
  locked_user_id?: string | null;
  locked_user_name?: string | null;
  lock_comment?: string | null;
  centroidCoordinates?: number[];
}

export interface ProjectState {
  individualProjectActiveTab: string;
  tasksData: TaskData[] | null;
  projectArea: GeojsonType | null;
  selectedTaskId: string;
  taskClickedOnTable: TaskClickedOnTable | null;
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
