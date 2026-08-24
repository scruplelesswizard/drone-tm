import { AxiosResponse } from 'axios';
import { useGetDashboardTaskStaticsQuery } from '@Api/dashboard';
import { DashboardSidebar, DashboardCard } from '@Components/Dashboard';
import { DashboardCardSkeleton } from '@Components/Dashboard/DashboardCard';
import RequestLogs from '@Components/Dashboard/RequestLogs';
import TaskLogs from '@Components/Dashboard/TaskLogs';
import {
  dashboardCardsForDroneOperator,
  dashboardCardsForProjectCreator,
} from '@Constants/dashboard';
import hasErrorBoundary from '@Utils/hasErrorBoundary';
import { useEffect, useState } from 'react';
import useSignedInRole from '@Hooks/useSignedInRole';
import { m } from '@/paraglide/messages';
import { FlexRow } from '@/components/common/Layouts';

const getContent = (activeTab: string, title: string) => {
  if (activeTab === 'request_logs') return <RequestLogs />;
  return <TaskLogs title={title} activeTab={activeTab} />;
};

const defaultTabFor = (role: string) =>
  role === 'PROJECT_CREATOR'
    ? { value: 'request_logs', title: m.dashboard_request_logs_title() }
    : { value: 'ongoing_tasks', title: m.dashboard_ongoing_tasks_title() };

const Dashboard = () => {
  const [signedInAs] = useSignedInRole();
  const [activeTab, setActiveTab] = useState(() => defaultTabFor(signedInAs));
  const dashboardCards =
    signedInAs === 'PROJECT_CREATOR'
      ? dashboardCardsForProjectCreator()
      : dashboardCardsForDroneOperator();

  // request_logs only exists for project creators - toggling to Operate
  // mid-session must not leave that stale tab selected, since it isn't
  // even one of the drone-operator card options any more.
  useEffect(() => {
    setActiveTab(current =>
      dashboardCards.some(card => card.value === current.value)
        ? current
        : defaultTabFor(signedInAs),
    );
    // Only re-run when the role itself changes, not on every dashboardCards
    // identity change (a fresh array every render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedInAs]);

  const { data: taskStatistics, isLoading } = useGetDashboardTaskStaticsQuery({
    select: (res: unknown) => {
      const taskCounts = (res as AxiosResponse<Record<string, number>>).data;
      return dashboardCards?.map(card => ({
        ...card,
        count: taskCounts?.[`${card?.value}`],
      }));
    },
  }) as {
    data?: ((typeof dashboardCards)[number] & { count?: number })[];
    isLoading: boolean;
  };

  return (
    <section className="naxatw-min-h-screen-nav naxatw-flex naxatw-flex-col naxatw-overflow-y-auto naxatw-px-3 naxatw-pt-2 lg:naxatw-px-16">
      <FlexRow className="naxatw-py-5">
        <h5 className="naxatw-font-bold">{m.dashboard_profile_heading()}</h5>
      </FlexRow>
      <div className="naxatw-grid naxatw-h-full naxatw-w-full naxatw-grid-cols-10 naxatw-gap-5">
        <div className="naxatw-col-span-10 naxatw-py-4 md:naxatw-col-span-3">
          <DashboardSidebar />
        </div>
        <div className="naxatw-col-span-10 naxatw-flex naxatw-w-full naxatw-flex-col naxatw-py-4 md:naxatw-col-span-7">
          <div className="naxatw-grid naxatw-grid-cols-2 naxatw-gap-5 lg:naxatw-grid-cols-4">
            {isLoading ? (
              <>
                {Array.from({ length: 4 }, (_, index) => (
                  <DashboardCardSkeleton key={index} />
                ))}
              </>
            ) : (
              taskStatistics?.map(task => (
                <div
                  key={task.id}
                  tabIndex={0}
                  role="button"
                  onKeyUp={() =>
                    setActiveTab({ value: task.value, title: task.title })
                  }
                  onClick={() =>
                    setActiveTab({ value: task.value, title: task.title })
                  }
                  className="naxatw-w-full naxatw-cursor-pointer md:naxatw-w-auto"
                >
                  <DashboardCard
                    title={task.title}
                    count={task?.count ?? 0}
                    active={task.value === activeTab.value}
                  />
                </div>
              ))
            )}
          </div>
          {getContent(activeTab.value, activeTab.title)}
        </div>
      </div>
    </section>
  );
};

export default hasErrorBoundary(Dashboard);
