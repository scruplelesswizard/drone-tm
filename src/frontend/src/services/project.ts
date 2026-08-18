import { authenticated, api } from '.';

// Response item shape of GET /tasks/states/{project_id} (task_schemas.Task).
// Only 3 fields - task_id, not id - distinct from TaskOut (services/createproject.ts).
export interface TaskStateItem {
  task_id: string;
  project_id: string;
  state: string;
}

export const getTaskStates = (projectId: string) =>
  api.get<TaskStateItem[]>(`/tasks/states/${projectId}`);

export const postTaskStatus = (payload: {
  projectId: string;
  taskId: string;
  data: { event: string; updated_at?: string; comment?: string };
}) => {
  const { projectId, taskId, data } = payload;
  return authenticated(api).post(`/tasks/event/${projectId}/${taskId}`, data, {
    headers: { 'Content-Type': 'application/json' },
  });
};

export const manualOverrideTaskState = (payload: {
  projectId: string;
  taskId: string;
  state: string;
}) => {
  const { projectId, taskId, state } = payload;
  return authenticated(api).post(
    `/tasks/manual-override/${projectId}/${taskId}`,
    { state, updated_at: new Date().toISOString() },
    { headers: { 'Content-Type': 'application/json' } },
  );
};

export const getRequestedTasks = () =>
  authenticated(api).get('/tasks/requested_tasks/pending');

export const processAllImagery = (data: {
  projectId: string;
  capacityType?: string;
}) => {
  const { projectId, capacityType } = data;
  return authenticated(api).post(
    `/projects/process_all_imagery/${projectId}`,
    capacityType ? { capacity_type: capacityType } : undefined,
    { headers: { 'Content-Type': 'application/json' } },
  );
};

export const saveGcpFile = (data: { projectId: string; gcp_file: File }) => {
  const formData = new FormData();
  formData.append('gcp_file', data.gcp_file);
  return authenticated(api).post(`/gcp/save/${data.projectId}`, formData);
};

export const deleteProject = (projectId: string) =>
  authenticated(api).delete(`/projects/${projectId}`);

export const uploadToOAM = (payload: { projectId: string; tags: string[] }) => {
  const { projectId, tags } = payload;
  return authenticated(api).post(
    `/projects/${projectId}/upload-to-oam`,
    {
      tags,
    },
    { headers: { 'Content-Type': 'application/json' } },
  );
};
