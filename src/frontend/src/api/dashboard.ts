import { UseQueryOptions, useQuery } from '@tanstack/react-query';
import { getRequestedTasks } from '@Services/project';
import { getTaskList, getTaskStatistics } from '@Services/dashboard';

export const useGetRequestedTasksListQuery = (
  queryOptions?: Partial<UseQueryOptions>,
) => {
  return useQuery({
    queryKey: ['requested-task-list'],
    queryFn: getRequestedTasks,
    select: (res: any) => res.data,
    ...queryOptions,
  });
};

export const useGetDashboardTaskStaticsQuery = (
  queryOptions?: Partial<UseQueryOptions>,
) => {
  return useQuery({
    queryKey: ['task-statistics'],
    queryFn: getTaskStatistics,
    select: (res: any) => res.data,
    ...queryOptions,
  });
};

export const useGetTaskListQuery = (
  queryOptions?: Partial<UseQueryOptions>,
) => {
  return useQuery({
    queryKey: ['task-list'],
    queryFn: getTaskList,
    // Backend now returns { results, pagination } instead of a bare list.
    select: (res: any) => res.data.results,
    ...queryOptions,
  });
};
