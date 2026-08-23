import { useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import { useTypedSelector } from '@Store/hooks';
import {
  ProjectCard,
  ProjectsHeader,
  ProjectsMapSection,
} from '@Components/Projects';
import NoDataComponent from '@Components/common/DataTable/NoDataFound';
import {
  useGetProjectCentroidQuery,
  useGetProjectsListQuery,
} from '@Api/projects';
import ProjectCardSkeleton from '@Components/Projects/ProjectCardSkeleton';
import hasErrorBoundary from '@Utils/hasErrorBoundary';
import { setCreateProjectState } from '@Store/actions/createproject';
import Pagination from '@Components/Projects/Pagination';
import Skeleton from '@Components/RadixComponents/Skeleton';
import { setCommonState } from '@Store/actions/common';
import { m } from '@/paraglide/messages';

interface ProjectListItem {
  id: string;
  slug: string;
  image_url?: string;
  name: string;
  description?: string;
  total_task_count?: number;
  status?: string;
  completed_task_count?: number;
}

const Projects = () => {
  const dispatch = useDispatch();
  const showMap = useTypedSelector(state => state.common.showMap);
  const projectsFilterByOwner = useTypedSelector(
    state => state.createproject.ProjectsFilterByOwner,
  );
  const projectFilterByStatus = useTypedSelector(
    state => state.createproject.selectedProjectStatus,
  );
  const projectSearchKey = useTypedSelector(
    state => state.common.projectSearchKey,
  );
  const [paginationState, setSetPaginationState] = useState({
    activePage: 1,
    selectedNumberOfRows: 12,
  });

  const handlePaginationState = (value: Record<string, number>) => {
    setSetPaginationState(prev => ({ ...prev, ...value }));
  };

  const filterParams = projectFilterByStatus
    ? {
        filter_by_owner: projectsFilterByOwner === 'yes',
        status: projectFilterByStatus,
        page: paginationState?.activePage,
        results_per_page: paginationState?.selectedNumberOfRows,
        search: projectSearchKey,
      }
    : {
        filter_by_owner: projectsFilterByOwner === 'yes',
        page: paginationState?.activePage,
        results_per_page: paginationState?.selectedNumberOfRows,
        search: projectSearchKey,
      };

  // fetch api for projectsList
  const { data: projectListData, isFetching: isLoading } =
    useGetProjectsListQuery({
      // @ts-expect-error queryKey override is not part of this hook's documented params type
      queryKey: { ...filterParams },
    }) as {
      data?: {
        results?: ProjectListItem[];
        pagination?: { total?: number };
      };
      isFetching: boolean;
    };

  // fetch project centroid
  const { data: projectCentroids, isFetching: isCentroidFetching } =
    // @ts-expect-error queryKey override is not part of this hook's documented params type
    useGetProjectCentroidQuery({ queryKey: { ...filterParams } });

  useEffect(() => {
    handlePaginationState({ activePage: 1 });
  }, [projectSearchKey, projectsFilterByOwner]);

  useEffect(() => {
    return () => {
      dispatch(setCreateProjectState({ ProjectsFilterByOwner: 'no' }));
      dispatch(setCommonState({ projectSearchKey: '' }));
    };
  }, [dispatch]);

  const resultCount = projectListData?.results?.length ?? 0;
  // Round 6/8 density finding: forcing the cards+map row to full viewport
  // height regardless of result count left a single low-count project
  // card floating above a large empty void. Below a full first page
  // (12), let the row size to its content instead.
  const isLowCount = !isLoading && resultCount > 0 && resultCount <= 3;
  const isEmpty = !isLoading && resultCount === 0;

  return (
    <section className="naxatw-px-3 naxatw-pt-2 lg:naxatw-px-16">
      <ProjectsHeader />

      <div
        className={`naxatw-grid naxatw-gap-2 naxatw-pb-10 md:naxatw-flex md:naxatw-pb-0 ${
          isLowCount || isEmpty
            ? 'md:naxatw-h-auto'
            : 'md:naxatw-h-[calc(100vh-11rem)]'
        }`}
      >
        <div
          className={`scrollbar naxatw-grid naxatw-grid-rows-[19rem] naxatw-gap-3 naxatw-overflow-y-auto naxatw-py-2 ${showMap ? 'naxatw-w-full naxatw-grid-cols-1 md:naxatw-w-1/2 md:naxatw-grid-cols-1 lg:naxatw-grid-cols-2 xl:naxatw-grid-cols-3' : 'naxatw-w-full naxatw-grid-cols-1 sm:naxatw-grid-cols-2 md:naxatw-grid-cols-3 lg:naxatw-grid-cols-6'}`}
          style={{ gridAutoRows: '19rem' }}
        >
          {isLoading ? (
            <>
              {Array.from({ length: 6 }, (_, index) => (
                <ProjectCardSkeleton key={index} />
              ))}
            </>
          ) : (
            <>
              {isEmpty && (
                <div className="naxatw-col-span-full naxatw-row-span-full">
                  <NoDataComponent
                    message={m.projects_no_projects_available()}
                  />
                </div>
              )}
              {projectListData?.results?.map(project => (
                <ProjectCard
                  key={project.id}
                  // ProjectCard's id prop is typed number, but backend
                  // project ids are UUID strings - pre-existing mismatch,
                  // not introduced here.
                  id={project.id as unknown as number}
                  slug={project.slug}
                  imageUrl={project?.image_url ?? null}
                  title={project.name}
                  description={project.description ?? ''}
                  totalTasks={project?.total_task_count ?? 0}
                  status={project?.status ?? ''}
                  completedTask={project?.completed_task_count ?? 0}
                />
              ))}
            </>
          )}
        </div>
        {showMap && (
          <div
            className={`naxatw-h-[70vh] naxatw-w-full naxatw-py-2 naxatw-shadow-xl md:naxatw-w-1/2 ${
              isLowCount || isEmpty ? 'md:naxatw-h-[19rem]' : 'md:naxatw-h-full'
            }`}
          >
            {!isCentroidFetching ? (
              <ProjectsMapSection
                projectCentroidList={
                  projectCentroids as Record<string, unknown>[]
                }
              />
            ) : (
              <Skeleton className="axatw-animate-pulse naxatw-h-full naxatw-w-full" />
            )}
          </div>
        )}
      </div>
      <div className="naxatw-px-3 lg:naxatw-px-16">
        <Pagination
          totalCount={projectListData?.pagination?.total ?? 0}
          currentPage={paginationState?.activePage}
          pageSize={paginationState?.selectedNumberOfRows}
          handlePaginationState={handlePaginationState}
        />
      </div>
    </section>
  );
};

export default hasErrorBoundary(Projects);
