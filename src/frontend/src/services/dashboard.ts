import { authenticated, api } from '.';

// Response item shape of GET /tasks (task_schemas.UserTasksOut).
export interface UserTasksOut {
  task_id: string;
  total_area_sqkm: number | null;
  flight_time_minutes: number | null;
  flight_distance_km: number | null;
  created_at: string;
  state: string;
  project_id: string;
  project_task_index: number;
  project_name: string;
  project_slug: string | null;
  updated_at: string | null;
  registration_certificate_url: string | null;
  certificate_url: string | null;
}

export const getTaskStatistics = () =>
  authenticated(api).get('/tasks/statistics');

export const getTaskList = () =>
  authenticated(api).get<{ results: UserTasksOut[] }>('/tasks');
