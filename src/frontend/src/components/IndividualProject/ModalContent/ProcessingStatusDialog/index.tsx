import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import axios from 'axios';
import { matchPath, useLocation } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { toast } from 'react-toastify';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useGetProjectsDetailQuery } from '@Api/projects';
import { useGetAllTaskAssetsInfo } from '@Api/tasks';
import {
  postProcessImagery,
  postReconcileProcessing,
  postRetryTransfer,
} from '@Services/tasks';
import { processAllImagery, saveGcpFile } from '@Services/project';
import {
  getProjectTaskImagerySummary,
  getProjectCoverage,
  TaskImagerySummary,
  ProjectCoverage,
} from '@Services/classification';
import { buildDownloadUrl } from '@Utils/index';
import { Button } from '@Components/RadixComponents/Button';
import { toggleModal } from '@Store/actions/common';
import { setProjectState } from '@Store/actions/project';
import { m } from '@/paraglide/messages';
import TaskTable from './TaskTable';
import GcpStatusCard from './GcpStatusCard';
import FinalProcessingPanel from './FinalProcessingPanel';
import FinalProcessingResults from './FinalProcessingResults';
import { ProcessingDialogProjectDetail, ProcessingDialogTask } from './types';

// Lazy-loaded so the ~150KB OpenLayers chunk only ships when a user
// actually clicks View on a finished task.
const TaskOrthoCogViewer = lazy(() => import('../TaskOrthoCogViewer'));

const ProcessingStatusDialog = () => {
  const { pathname } = useLocation();
  const projectRouteId = useMemo(() => {
    const projectMatch = matchPath('/projects/:id', pathname);
    const approvalMatch = matchPath('/projects/:id/approval', pathname);
    return projectMatch?.params.id || approvalMatch?.params.id || '';
  }, [pathname]);
  const dispatch = useDispatch();
  const queryClient = useQueryClient();

  const [selectedTasks, setSelectedTasks] = useState<Set<string>>(new Set());
  const [processingTasks, setProcessingTasks] = useState<Set<string>>(
    new Set(),
  );
  // Tasks whose transfer-resume request is in flight; drives a brief spinner.
  const [transferringTasks, setTransferringTasks] = useState<Set<string>>(
    new Set(),
  );
  // When non-null, render the OL COG viewer overlay for this task's
  // signed orthophoto URL. Cleared by clicking the close button, the
  // backdrop, or pressing Escape (handled inside the viewer).
  const [viewerTask, setViewerTask] = useState<{
    url: string;
    title: string;
  } | null>(null);

  // allTaskAssets: S3-based data (assets_url, image_count from disk, state)
  const { data: projectDetail } = useGetProjectsDetailQuery(projectRouteId) as {
    data?: ProcessingDialogProjectDetail;
  };
  const projectId = projectDetail?.id || projectRouteId;
  const isProjectProcessing =
    projectDetail?.image_processing_status === 'PROCESSING';
  const {
    data: allTaskAssets,
    refetch: refetchAllTaskAssets,
    isFetching: isAllTasksFetching,
  } = useGetAllTaskAssetsInfo(projectId);

  // Backend summary: authoritative source for has_ready_imagery
  const {
    data: taskSummary,
    refetch: refetchTaskSummary,
    isFetching: isTaskSummaryFetching,
  } = useQuery<TaskImagerySummary[]>({
    queryKey: ['projectTaskImagerySummary', projectId],
    queryFn: () => getProjectTaskImagerySummary(projectId),
    enabled: !!projectId,
    // No polling (ADR 0006): status refreshes on open and via the Refresh button.
  });

  // Spatial coverage: actual PostGIS-computed percentage of project area covered
  const { data: projectCoverage, isFetching: isCoverageFetching } =
    useQuery<ProjectCoverage>({
      queryKey: ['projectCoverage', projectId],
      queryFn: () => getProjectCoverage(projectId),
      enabled: !!projectId,
    });

  // Build a lookup from task_id → has_ready_imagery so the backend is the
  // single source of truth for readiness decisions.
  const readinessMap = useMemo(() => {
    const map = new Map<string, boolean>();
    if (taskSummary) {
      taskSummary.forEach(t => {
        map.set(t.task_id, t.has_ready_imagery);
      });
    }
    return map;
  }, [taskSummary]);

  // Pending-transfer lookup - used to gate re-runs of FINISHED/FAILED tasks.
  // For re-processing, the imagery is already in the task folder; only an
  // in-flight staging→task move should block, matching the backend check at
  // POST /process_imagery/{project_id}/{task_id}/.
  const pendingTransferMap = useMemo(() => {
    const map = new Map<string, boolean>();
    if (taskSummary) {
      taskSummary.forEach(t => {
        map.set(t.task_id, t.imagery_transfer_pending === true);
      });
    }
    return map;
  }, [taskSummary]);

  const { mutateAsync: processTask } = useMutation({
    mutationFn: ({ taskId, odmUrl }: { taskId: string; odmUrl?: string }) =>
      postProcessImagery(projectId, taskId, odmUrl),
  });

  const { mutate: startAllImageProcessing, isPending: isProcessingAll } =
    useMutation({
      mutationFn: processAllImagery,
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['project-detail'] });
        queryClient.invalidateQueries({
          queryKey: ['all-task-assets-info', projectId],
        });
        queryClient.invalidateQueries({
          queryKey: ['projectTaskImagerySummary', projectId],
        });
        toast.success(m.processing_dialog_final_started_success());
      },
      onError: error => {
        const detail =
          axios.isAxiosError(error) &&
          typeof error.response?.data?.detail === 'string' &&
          error.response.data.detail
            ? error.response.data.detail
            : m.processing_dialog_final_start_failed();
        toast.error(detail);
      },
    });

  const toggleTaskSelection = useCallback((taskId: string) => {
    setSelectedTasks(prev => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  }, []);

  const handleProcessSelected = useCallback(async () => {
    const taskIds = Array.from(selectedTasks);
    setSelectedTasks(new Set());
    setProcessingTasks(new Set(taskIds));
    const results = await Promise.allSettled(
      taskIds.map(taskId => processTask({ taskId })),
    );
    let successCount = 0;
    let failCount = 0;
    results.forEach(result => {
      if (result.status === 'fulfilled') successCount++;
      else failCount++;
    });
    if (successCount > 0) {
      toast.success(
        m.processing_dialog_started_count_success({ count: successCount }),
      );
    }
    if (failCount > 0) {
      toast.error(m.processing_dialog_start_failed_count({ count: failCount }));
    }
    const failedTaskIds = taskIds.filter(
      (_taskId, index) => results[index].status === 'rejected',
    );
    if (failedTaskIds.length > 0) {
      setProcessingTasks(prev => {
        const next = new Set(prev);
        failedTaskIds.forEach(taskId => next.delete(taskId));
        return next;
      });
    }
    queryClient.invalidateQueries({
      queryKey: ['all-task-assets-info', projectId],
    });
    queryClient.invalidateQueries({
      queryKey: ['projectTaskImagerySummary', projectId],
    });
  }, [selectedTasks, processTask, queryClient, projectId]);

  const handleProcessSingle = useCallback(
    async (taskId: string, odmUrl?: string) => {
      setProcessingTasks(prev => new Set(prev).add(taskId));
      try {
        await processTask({ taskId, odmUrl });
        toast.success(m.processing_dialog_task_processing_started());
        queryClient.invalidateQueries({
          queryKey: ['all-task-assets-info', projectId],
        });
        queryClient.invalidateQueries({
          queryKey: ['projectTaskImagerySummary', projectId],
        });
      } catch (error) {
        const detail =
          axios.isAxiosError(error) &&
          typeof error.response?.data?.detail === 'string' &&
          error.response.data.detail
            ? error.response.data.detail
            : m.processing_dialog_processing_start_failed();
        toast.error(detail);
        setProcessingTasks(prev => {
          const next = new Set(prev);
          next.delete(taskId);
          return next;
        });
      }
    },
    [processTask, queryClient, projectId],
  );

  const { mutateAsync: retryTransfer } = useMutation({
    mutationFn: (taskId: string) => postRetryTransfer(projectId, taskId),
  });

  const handleRetryTransfer = useCallback(
    // Kicks off the server-side move and returns; the transfer runs in the
    // background. The spinner covers only this request - we don't poll (ADR
    // 0006), so the user hits Refresh to see progress and then Process.
    async (taskId: string) => {
      setTransferringTasks(prev => new Set(prev).add(taskId));
      try {
        const { data } = await retryTransfer(taskId);
        toast.success(data?.message || m.processing_dialog_transfer_resumed());
      } catch (error) {
        const detail =
          axios.isAxiosError(error) &&
          typeof error.response?.data?.detail === 'string' &&
          error.response.data.detail
            ? error.response.data.detail
            : m.processing_dialog_transfer_resume_failed();
        toast.error(detail);
      } finally {
        setTransferringTasks(prev => {
          const next = new Set(prev);
          next.delete(taskId);
          return next;
        });
      }
    },
    [retryTransfer],
  );

  const handleCopyTaskId = useCallback((taskId: string) => {
    navigator.clipboard.writeText(taskId);
    toast.success(m.processing_dialog_task_id_copied());
  }, []);

  const handleDownloadAssets = useCallback((assetsUrl: string) => {
    try {
      const link = document.createElement('a');
      link.href = buildDownloadUrl(assetsUrl);
      link.setAttribute('download', '');
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      toast.error(
        m.processing_dialog_download_failed({ error: String(error) }),
      );
    }
  }, []);

  const handleDownloadOrtho = useCallback((assetsUrl: string) => {
    try {
      const orthoUrl = assetsUrl.replace(/\/$/, '/orthophoto/');
      const link = document.createElement('a');
      link.href = buildDownloadUrl(orthoUrl);
      link.setAttribute('download', '');
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      toast.error(
        m.processing_dialog_download_failed({ error: String(error) }),
      );
    }
  }, []);

  const handleDownloadProjectFile = useCallback(
    (url: string, filename: string) => {
      try {
        const link = document.createElement('a');
        link.href = buildDownloadUrl(url);
        link.setAttribute('download', filename);
        document.body.appendChild(link);
        link.click();
        link.remove();
      } catch (error) {
        toast.error(
          m.processing_dialog_download_failed({ error: String(error) }),
        );
      }
    },
    [],
  );

  const getProcessButtonLabel = useCallback((task: ProcessingDialogTask) => {
    if (task.state === 'IMAGE_PROCESSING_FAILED') {
      return m.processing_dialog_button_retry();
    }
    if (task.state === 'IMAGE_PROCESSING_FINISHED') {
      return m.processing_dialog_button_rerun();
    }
    return m.processing_dialog_button_process();
  }, []);

  const handleStartFinalProcessing = useCallback(
    (withGcp: boolean, capacityType?: string) => {
      if (withGcp) {
        dispatch(setProjectState({ showGcpEditor: true }));
        dispatch(toggleModal());
      } else {
        startAllImageProcessing({ projectId, capacityType });
      }
    },
    [dispatch, startAllImageProcessing, projectId],
  );

  const gcpFileInputRef = useRef<HTMLInputElement>(null);

  const { mutate: uploadGcpFile, isPending: isUploadingGcp } = useMutation({
    mutationFn: saveGcpFile,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-detail'] });
      toast.success(m.processing_dialog_gcp_uploaded());
    },
    onError: () => {
      toast.error(m.processing_dialog_gcp_upload_failed());
    },
  });

  const handleGcpFileUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      uploadGcpFile({ projectId, gcp_file: file });
      // Reset so the same file can be re-selected
      e.target.value = '';
    },
    [projectId, uploadGcpFile],
  );

  const handleRefreshProcessingStatus = useCallback(async () => {
    if (!projectId) return;

    // Reconcile returns the fresh assets_info payload plus the ids of any
    // tasks we just finalised, so we seed the all-task-assets cache and
    // clear those ids from the optimistic processingTasks set in one shot.
    // Coverage doesn't change from processing-state transitions, so it's
    // omitted; readiness (taskSummary) can be affected by other actions
    // in this dialog so we still refresh it in parallel.
    let seededFromReconcile = false;
    let projectFinalised = false;
    try {
      const response = await postReconcileProcessing(projectId);
      const data = response?.data;
      const finalisedTaskIds: string[] = Array.isArray(data?.task_ids)
        ? data.task_ids
        : [];
      if (finalisedTaskIds.length > 0) {
        setProcessingTasks(prev => {
          if (prev.size === 0) return prev;
          const next = new Set(prev);
          finalisedTaskIds.forEach(id => next.delete(id));
          return next.size === prev.size ? prev : next;
        });
      }
      const assets = data?.assets;
      if (Array.isArray(assets)) {
        // useGetAllTaskAssetsInfo has `select: res => res.data`, so the
        // cache holds the raw axios-shaped response, not the payload.
        queryClient.setQueryData(['all-task-assets-info', projectId], {
          data: assets,
        });
        seededFromReconcile = true;
      }
      projectFinalised = data?.project_finalised === true;
    } catch {
      // Reconcile failure is non-fatal; the fallback refetch below covers it.
    }
    if (!seededFromReconcile) {
      await refetchAllTaskAssets();
    }

    await Promise.allSettled([
      refetchTaskSummary(),
      // If the reconcile flipped the project to SUCCESS, force an immediate
      // refetch so the final results section (ortho/DSM/DTM download buttons)
      // appears without waiting for another user action.
      projectFinalised
        ? queryClient.refetchQueries({
            queryKey: ['project-detail', projectId],
          })
        : queryClient.invalidateQueries({
            queryKey: ['project-detail', projectId],
          }),
    ]);
  }, [projectId, queryClient, refetchAllTaskAssets, refetchTaskSummary]);

  const totalTaskCount = useMemo(() => {
    if (typeof projectDetail?.total_task_count === 'number') {
      return projectDetail.total_task_count;
    }
    if (Array.isArray(taskSummary) && taskSummary.length > 0) {
      return taskSummary.length;
    }
    return Array.isArray(allTaskAssets) ? allTaskAssets.length : 0;
  }, [allTaskAssets, taskSummary, projectDetail]);

  const taskList = useMemo<ProcessingDialogTask[]>(() => {
    // allTaskAssets (AssetsInfo[]) doesn't declare task_index/failure_reason -
    // either stale/aspirational fields or a reconciliation endpoint this
    // codebase doesn't have yet (see todo.md). Kept loose rather than
    // asserting a backend shape that isn't confirmed.
    const looseTaskAssets = allTaskAssets as unknown as
      | Record<string, unknown>[]
      | undefined;
    const assetsByTaskId = new Map<string, Record<string, unknown>>();
    if (Array.isArray(looseTaskAssets)) {
      looseTaskAssets.forEach(task => {
        assetsByTaskId.set(task.task_id as string, task);
      });
    }

    if (Array.isArray(taskSummary) && taskSummary.length > 0) {
      return taskSummary
        .filter(
          task =>
            task.assigned_images > 0 ||
            task.task_state === 'READY_FOR_PROCESSING' ||
            task.task_state === 'IMAGE_PROCESSING_STARTED' ||
            task.task_state === 'IMAGE_PROCESSING_FINISHED' ||
            task.task_state === 'IMAGE_PROCESSING_FAILED',
        )
        .map(task => {
          const assetInfo = assetsByTaskId.get(task.task_id);
          return {
            task_id: task.task_id,
            task_index: task.project_task_index,
            image_count: task.assigned_images,
            state: task.task_state,
            failure_reason: task.failure_reason,
            assets_url: assetInfo?.assets_url as string | null | undefined,
            orthophoto_url: assetInfo?.orthophoto_url as
              | string
              | null
              | undefined,
            pending_transfer_count: task.pending_transfer_count,
          };
        })
        .sort((a, b) => a.task_index - b.task_index);
    }

    if (!Array.isArray(looseTaskAssets)) return [];

    return [...looseTaskAssets]
      .filter(
        t =>
          (t.image_count as number) > 0 ||
          t.state === 'READY_FOR_PROCESSING' ||
          t.state === 'IMAGE_PROCESSING_STARTED' ||
          t.state === 'IMAGE_PROCESSING_FINISHED' ||
          t.state === 'IMAGE_PROCESSING_FAILED',
      )
      .map(task => ({
        task_id: task.task_id as string,
        task_index: task.task_index as number,
        image_count: task.image_count as number,
        state: task.state as string,
        failure_reason: task.failure_reason as string | null | undefined,
        assets_url: task.assets_url as string | null | undefined,
        orthophoto_url: task.orthophoto_url as string | null | undefined,
      }))
      .sort((a, b) => {
        const aIdx = a.task_id?.localeCompare?.(b.task_id) || 0;
        return aIdx;
      });
  }, [allTaskAssets, taskSummary]);

  const processableTasks = useMemo(
    () => taskList.filter(task => readinessMap.get(task.task_id) === true),
    [taskList, readinessMap],
  );

  useEffect(() => {
    setProcessingTasks(prev => {
      if (prev.size === 0) return prev;

      const next = new Set(prev);
      taskList.forEach(task => {
        if (next.has(task.task_id) && task.state !== 'READY_FOR_PROCESSING') {
          next.delete(task.task_id);
        }
      });

      return next.size === prev.size ? prev : next;
    });
  }, [taskList]);

  // Reconcile once on open so status is current without polling.
  const reconciledForProject = useRef<string | null>(null);
  useEffect(() => {
    if (!projectId || reconciledForProject.current === projectId) return;
    reconciledForProject.current = projectId;
    handleRefreshProcessingStatus().catch(() => {});
  }, [projectId, handleRefreshProcessingStatus]);

  const toggleSelectAll = useCallback(() => {
    if (selectedTasks.size === processableTasks.length) {
      setSelectedTasks(new Set());
    } else {
      setSelectedTasks(new Set(processableTasks.map(task => task.task_id)));
    }
  }, [selectedTasks, processableTasks]);

  const processedCount = useMemo(
    () => taskList.filter(t => t.state === 'IMAGE_PROCESSING_FINISHED').length,
    [taskList],
  );

  const allTasksProcessed = useMemo(
    () =>
      totalTaskCount > 0 &&
      Array.isArray(taskSummary) &&
      taskSummary.length === totalTaskCount &&
      taskSummary.every(
        task => task.task_state === 'IMAGE_PROCESSING_FINISHED',
      ),
    [taskSummary, totalTaskCount],
  );

  const coveragePercentage = projectCoverage?.coverage_percentage ?? 0;

  const tasksReady = useMemo(() => {
    if (!Array.isArray(taskSummary)) return 0;
    return taskSummary.filter(t => t.has_ready_imagery).length;
  }, [taskSummary]);

  const tasksWithImagery = useMemo(() => {
    if (!Array.isArray(taskSummary)) return 0;
    return taskSummary.filter(
      t => t.task_state === 'HAS_IMAGERY' && t.assigned_images > 0,
    ).length;
  }, [taskSummary]);

  const totalProcessable = tasksReady + tasksWithImagery;

  const isFinalProcessingRunning = isProjectProcessing || isProcessingAll;

  const finalProcessingDisabledReason = useMemo(() => {
    if (isFinalProcessingRunning) {
      return m.processing_dialog_already_in_progress();
    }
    if (!totalTaskCount) {
      return m.processing_dialog_no_tasks_available();
    }
    if (totalProcessable === 0) {
      return m.processing_dialog_no_imagery_available();
    }
    return '';
  }, [isFinalProcessingRunning, totalTaskCount, totalProcessable]);

  const hasSavedGcp = Boolean(projectDetail?.has_gcp);

  return (
    <>
      <div className="naxatw-flex naxatw-flex-col naxatw-gap-4">
        {/* Per-task processing section */}
        <div className="naxatw-flex naxatw-items-start naxatw-justify-between naxatw-gap-3">
          <div>
            <h3 className="naxatw-text-sm naxatw-font-semibold naxatw-text-gray-800">
              {m.processing_dialog_task_processing_title()}
            </h3>
            <p className="naxatw-mt-1 naxatw-text-xs naxatw-text-gray-500">
              {m.processing_dialog_task_processing_desc()}
            </p>
          </div>
          <a
            href="https://processing.drone.hotosm.org"
            target="_blank"
            rel="noopener noreferrer"
            className="naxatw-shrink-0 naxatw-text-xs naxatw-font-semibold naxatw-text-blue-700 naxatw-underline-offset-2 hover:naxatw-underline"
          >
            {m.processing_dialog_view_queue()}
          </a>
        </div>

        <TaskTable
          taskList={taskList}
          processableTasks={processableTasks}
          selectedTasks={selectedTasks}
          processingTasks={processingTasks}
          transferringTasks={transferringTasks}
          readinessMap={readinessMap}
          pendingTransferMap={pendingTransferMap}
          toggleTaskSelection={toggleTaskSelection}
          toggleSelectAll={toggleSelectAll}
          handleCopyTaskId={handleCopyTaskId}
          handleDownloadOrtho={handleDownloadOrtho}
          handleDownloadAssets={handleDownloadAssets}
          handleProcessSingle={handleProcessSingle}
          handleRetryTransfer={handleRetryTransfer}
          getProcessButtonLabel={getProcessButtonLabel}
          setViewerTask={setViewerTask}
        />

        {/* Process Selected button */}
        {selectedTasks.size > 0 && (
          <div className="naxatw-flex naxatw-justify-center">
            <Button
              variant="ghost"
              className="naxatw-bg-red naxatw-text-white disabled:naxatw-bg-gray-400"
              leftIcon="play_arrow"
              onClick={() => {
                if (
                  // eslint-disable-next-line no-alert -- deliberate blocking confirm before batch-processing a possibly-large task selection
                  !window.confirm(
                    m.processing_dialog_process_selected_confirm({
                      count: selectedTasks.size,
                    }),
                  )
                ) {
                  return;
                }
                handleProcessSelected();
              }}
              disabled={selectedTasks.size === 0}
            >
              {m.processing_dialog_process_selected({
                count: selectedTasks.size,
              })}
            </Button>
          </div>
        )}

        {/* Status summary */}
        <div className="naxatw-flex naxatw-items-center naxatw-justify-center naxatw-gap-2">
          <p className="naxatw-text-center naxatw-text-xs naxatw-text-gray-500">
            {m.processing_dialog_tasks_processed({
              processed: processedCount,
              total: taskList.length,
            })}
            {taskList.length < totalTaskCount && (
              <span className="naxatw-ml-1">
                {m.processing_dialog_tasks_awaiting_imagery({
                  count: totalTaskCount - taskList.length,
                })}
              </span>
            )}
          </p>
          <Button
            variant="outline"
            className="naxatw-h-8 naxatw-shrink-0 naxatw-border-blue-300 naxatw-px-3 naxatw-text-xs naxatw-text-blue-700"
            leftIcon="refresh"
            iconClassname={`!naxatw-text-sm ${isTaskSummaryFetching || isCoverageFetching || isAllTasksFetching ? 'naxatw-animate-spin' : ''}`}
            onClick={handleRefreshProcessingStatus}
            disabled={
              isTaskSummaryFetching || isCoverageFetching || isAllTasksFetching
            }
          >
            {m.common_refresh()}
          </Button>
        </div>

        {taskList.length === 0 && (
          <div className="naxatw-flex naxatw-flex-col naxatw-items-center naxatw-gap-2 naxatw-py-6 naxatw-text-gray-500">
            <span className="material-icons naxatw-text-4xl naxatw-text-gray-300">
              image_search
            </span>
            <p className="naxatw-text-sm">
              {m.processing_dialog_no_tasks_ready_title()}
            </p>
            <p className="naxatw-text-xs">
              {m.processing_dialog_no_tasks_ready_help()}
            </p>
          </div>
        )}

        {/* Divider */}
        <hr className="naxatw-border-gray-200" />

        {/* Final Processing section */}
        <div>
          <h3 className="naxatw-text-sm naxatw-font-semibold naxatw-text-gray-800">
            {m.processing_dialog_final_processing_title()}
          </h3>
          <p className="naxatw-mt-1 naxatw-text-xs naxatw-text-gray-500">
            {m.processing_dialog_final_processing_desc()}
          </p>
        </div>

        <GcpStatusCard
          hasSavedGcp={hasSavedGcp}
          isUploadingGcp={isUploadingGcp}
          gcpFileInputRef={gcpFileInputRef}
          onOpenGcpEditor={() => {
            dispatch(setProjectState({ showGcpEditor: true }));
            dispatch(toggleModal());
          }}
          onGcpFileUpload={handleGcpFileUpload}
        />

        <FinalProcessingPanel
          finalProcessingDisabledReason={finalProcessingDisabledReason}
          allTasksProcessed={allTasksProcessed}
          coveragePercentage={coveragePercentage}
          isCoverageFetching={isCoverageFetching}
          tasksReady={tasksReady}
          totalTaskCount={totalTaskCount}
          isFinalProcessingRunning={isFinalProcessingRunning}
          isProcessingAll={isProcessingAll}
          isTaskSummaryFetching={isTaskSummaryFetching}
          projectImageProcessingStatus={projectDetail?.image_processing_status}
          totalProcessable={totalProcessable}
          tasksWithImagery={tasksWithImagery}
          onStartFinalProcessing={handleStartFinalProcessing}
        />

        {/* Final processing results - shown once processing is complete */}
        {projectDetail?.image_processing_status === 'SUCCESS' && (
          <FinalProcessingResults
            projectDetail={projectDetail}
            projectId={projectId}
            onDownloadProjectFile={handleDownloadProjectFile}
          />
        )}
      </div>

      {viewerTask ? (
        <Suspense fallback={null}>
          <TaskOrthoCogViewer
            signedUrl={viewerTask.url}
            title={viewerTask.title}
            onClose={() => setViewerTask(null)}
          />
        </Suspense>
      ) : null}
    </>
  );
};

export default ProcessingStatusDialog;
