import { GeojsonType } from '@Components/common/MapLibreComponents/types';
import { authenticated, api } from '.';

// A single task as it appears nested in ProjectInfo.tasks (GET /projects/{id}).
// Distinct from the task-states endpoint's Task shape (task_id, not id) and
// from TaskDetailsOut (the single-task detail endpoint) - see services/tasks.ts.
export interface TaskOut {
  id: string;
  project_id: string;
  project_task_index: number;
  outline: GeojsonType | null;
  state: string | null;
  user_id: string | null;
  name: string | null;
  comment: string | null;
  image_count: number | null;
  assets_url: string | null;
  total_area_sqkm: number | null;
  flight_time_minutes: number | null;
  flight_distance_km: number | null;
  total_image_uploaded: number | null;
}

// Response shape of GET /projects/{id} (project_schemas.ProjectInfo).
export interface ProjectInfo {
  id: string;
  slug: string | null;
  name: string;
  description: string | null;
  per_task_instructions: string | null;
  requires_approval_from_manager_for_locking: boolean | null;
  outline: GeojsonType | null;
  no_fly_zones: GeojsonType | null;
  requires_approval_from_regulator: boolean | null;
  regulator_emails: string[] | null;
  regulator_approval_status: 'PENDING' | 'APPROVED' | 'REJECTED' | null;
  image_processing_status: string | null;
  oam_upload_status: string | null;
  cloud_ortho_ready: boolean;
  cloud_mesh_ready: boolean;
  cloud_ortho_generating: boolean;
  cloud_mesh_generating: boolean;
  cloud_ortho_cog_url: string | null;
  cloud_mesh_tileset_url: string | null;
  mesh_glb_url: string | null;
  mesh_source_available: boolean;
  odm_task_uuid: string | null;
  assets_url: string | null;
  orthophoto_url: string | null;
  dsm_url: string | null;
  dtm_url: string | null;
  pointcloud_url: string | null;
  output_orthophoto_url: string | null;
  output_pointcloud_url: string | null;
  output_odm_assets_url: string | null;
  has_gcp: boolean;
  regulator_comment: string | null;
  commenting_regulator_id: string | null;
  author_name: string | null;
  project_area: number | null;
  task_split_dimension: number | null;
  final_output:
    | (
        | 'ORTHOPHOTO_2D'
        | 'DIGITAL_TERRAIN_MODEL'
        | 'DIGITAL_SURFACE_MODEL'
        | 'POINT_CLOUD'
      )[]
    | null;
  front_overlap: number | null;
  side_overlap: number | null;
  gsd_cm_px: number | null;
  altitude_from_ground: number | null;
  total_task_count: number;
  tasks: TaskOut[] | null;
  image_url: string | null;
  ongoing_task_count: number | null;
  completed_task_count: number | null;
  status: string | null;
  created_at: string;
  author_id: string;
  is_terrain_follow: boolean;
}

export const getProjectsList = (params: Record<string, unknown>) =>
  authenticated(api).get(`/projects`, { params });

export const getProjectDetail = (id: string) =>
  authenticated(api).get<ProjectInfo>(`/projects/${id}`);

export const triggerOrthophotoConversion = (id: string) =>
  authenticated(api).post(`/projects/${id}/cloudnative/orthophoto`);

export const triggerMeshConversion = (id: string) =>
  authenticated(api).post(`/projects/${id}/cloudnative/mesh`);

export const postCreateProject = (data: FormData) =>
  authenticated(api).post('/projects', data, {
    // headers: { 'Content-Type': 'application/json' },
  });

export const postNormalizeAoi = (data: FormData) =>
  authenticated(api).post('/projects/normalize-aoi', data);

export const postPreviewSplitBySquare = (data: FormData) =>
  authenticated(api).post('/projects/preview-split-by-square', data);

export const postTaskBoundary = ({
  id,
  data,
}: {
  id: number;
  data: FormData;
}) => authenticated(api).post(`/projects/${id}/upload-task-boundaries`, data);

export const getProjectCentroid = (params: Record<string, unknown>) =>
  authenticated(api).get('/projects/centroids', { params });

export const regulatorUser = (data: { token: string }) =>
  api.post(`/users/regulator`, data, {
    headers: { 'Content-Type': 'application/json' },
  });

export const regulatorComment = (payload: {
  projectId: string;
  regulator_comment: string;
  regulator_approval_status: string;
}) => {
  const { projectId, ...data } = payload;
  return authenticated(api).post(
    `/projects/regulator/comment/${projectId}`,
    data,
    {
      headers: { 'Content-Type': 'application/json' },
    },
  );
};

export const getDroneAltitude = (country: string) =>
  authenticated(api).get(`/drones/drone-altitude/${country}`);

export const getProjectWayPoints = (
  params: Record<string, unknown>,
  geojsonData: { project_geojson: File; dem?: File | null },
) => authenticated(api).post(`/projects/waypoints`, geojsonData, { params });
