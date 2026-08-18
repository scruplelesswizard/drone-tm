import { GeojsonType } from '@Components/common/MapLibreComponents/types';
import { api, authenticated } from '.';

// Response shape of GET /tasks/{task_id} and GET /tasks/project/{project_id}/{task_index}
// (task_schemas.TaskDetailsOut) - a third, richer single-task shape,
// distinct from TaskOut (services/createproject.ts) and TaskStateItem
// (services/project.ts). See useTaskParams().
export interface TaskDetailsOut {
  total_area_sqkm: number | null;
  flight_time_minutes: number | null;
  flight_distance_km: number | null;
  total_image_uploaded: number | null;
  assets_url: string | null;
  outline: GeojsonType;
  created_at: string | null;
  updated_at: string | null;
  state: string;
  project_id: string | null;
  project_slug: string | null;
  project_name: string;
  project_task_index: number;
  front_overlap: number | null;
  side_overlap: number | null;
  gsd_cm_px: number | null;
  gimble_angles_degrees: number | null;
  centroid: Record<string, unknown>;
  id?: string;
}

// Response shape of GET /projects/assets/{project_id}[?task_id=] (project_schemas.AssetsInfo).
export interface AssetsInfo {
  project_id: string;
  task_id: string;
  image_count: number;
  assets_url: string | null;
  orthophoto_url: string | null;
  state: string | null;
}

export const getTaskWaypoint = (
  projectId: string,
  taskId: string,
  mode: string,
  droneModel: string,
  rotationAngle: number,
  gimbalAngle: string,
  allowMissingDem = false,
) =>
  authenticated(api).post(
    `/waypoint/task/${taskId}?project_id=${projectId}&download=false&mode=${mode}&drone_type=${droneModel}&rotation_angle=${rotationAngle}&gimbal_angle=${gimbalAngle}&allow_missing_dem=${allowMissingDem}`,
  );

export const getIndividualTask = (taskId: string) =>
  authenticated(api).get<TaskDetailsOut>(`/tasks/${taskId}`);

export const getTaskByProjectAndIndex = (
  projectId: string,
  taskIndex: string | number,
) =>
  authenticated(api).get<TaskDetailsOut>(
    `/tasks/project/${projectId}/${taskIndex}`,
  );

// TODO refactor this out and replace with getTaskWaypoint?
// This is used to update the take off point
export const postTaskWaypoint = (payload: {
  taskId: string;
  projectId: string;
  mode: string;
  rotationAngle: number;
  droneModel: string;
  takeOffPoint: { longitude: number; latitude: number };
  gimbalAngle: string;
  allowMissingDem?: boolean;
}) => {
  const {
    taskId,
    projectId,
    mode,
    rotationAngle,
    droneModel,
    takeOffPoint,
    gimbalAngle,
    allowMissingDem = false,
  } = payload;

  return authenticated(api).post(
    `/waypoint/task/${taskId}?project_id=${projectId}&download=false&mode=${mode}&drone_type=${droneModel}&rotation_angle=${rotationAngle}&gimbal_angle=${gimbalAngle}&allow_missing_dem=${allowMissingDem}`,
    takeOffPoint,
    {
      headers: { 'Content-Type': 'application/json' },
    },
  );
};
export const getTaskAssetsInfo = (projectId: string, taskId: string) =>
  authenticated(api).get<AssetsInfo>(
    `/projects/assets/${projectId}?task_id=${taskId}`,
  );

export const getAllTaskAssetsInfo = (projectId: string) =>
  authenticated(api).get<AssetsInfo[]>(`/projects/assets/${projectId}`);

export const postProcessImagery = (
  projectId: string,
  taskId: string,
  odmUrl?: string,
) =>
  authenticated(api).post(
    `/projects/process_imagery/${projectId}/${taskId}/${odmUrl ? `?odm_url=${encodeURIComponent(odmUrl)}` : ''}`,
  );

export const postReconcileProcessing = (projectId: string) =>
  authenticated(api).post(`/projects/assets/${projectId}/reconcile`);

export const postRetryTransfer = (projectId: string, taskId: string) =>
  authenticated(api).post(`/projects/retry_transfer/${projectId}/${taskId}`);

export const postRotatedTaskWayPoint = (payload: {
  taskId: string;
  data: Record<string, unknown>;
}) => {
  const { taskId, data } = payload;
  return authenticated(api).post(`/waypoint/${taskId}/generate-kmz`, data, {
    headers: { 'Content-Type': 'application/json' },
  });
};
