import { authenticated, api } from '.';

export const getProjectsList = (params: Record<string, unknown>) =>
  authenticated(api).get(`/projects`, { params });

export const getProjectDetail = (id: string) =>
  authenticated(api).get(`/projects/${id}`);

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
