import { formatString } from '@Utils/index';
import { Button } from '@Components/RadixComponents/Button';
import Icon from '@Components/common/Icon';
import { m } from '@/paraglide/messages';
import { ProcessingDialogTask, stateColors } from './types';

interface TaskTableProps {
  taskList: ProcessingDialogTask[];
  processableTasks: ProcessingDialogTask[];
  selectedTasks: Set<string>;
  processingTasks: Set<string>;
  transferringTasks: Set<string>;
  readinessMap: Map<string, boolean>;
  pendingTransferMap: Map<string, boolean>;
  toggleTaskSelection: (taskId: string) => void;
  toggleSelectAll: () => void;
  handleCopyTaskId: (taskId: string) => void;
  handleDownloadOrtho: (assetsUrl: string) => void;
  handleDownloadAssets: (assetsUrl: string) => void;
  handleProcessSingle: (taskId: string, odmUrl?: string) => void;
  handleRetryTransfer: (taskId: string) => void;
  getProcessButtonLabel: (task: ProcessingDialogTask) => string;
  setViewerTask: (task: { url: string; title: string } | null) => void;
}

// Extracted verbatim from ProcessingStatusDialog's JSX - all state/handlers
// still live in the parent, this only owns row layout/markup.
export default function TaskTable({
  taskList,
  processableTasks,
  selectedTasks,
  processingTasks,
  transferringTasks,
  readinessMap,
  pendingTransferMap,
  toggleTaskSelection,
  toggleSelectAll,
  handleCopyTaskId,
  handleDownloadOrtho,
  handleDownloadAssets,
  handleProcessSingle,
  handleRetryTransfer,
  getProcessButtonLabel,
  setViewerTask,
}: TaskTableProps) {
  return (
    <div className="naxatw-max-h-[300px] naxatw-overflow-y-auto naxatw-rounded naxatw-border naxatw-border-gray-200">
      <table className="naxatw-w-full naxatw-text-sm">
        <thead className="naxatw-sticky naxatw-top-0 naxatw-bg-gray-50">
          <tr className="naxatw-border-b naxatw-border-gray-200">
            <th className="naxatw-px-3 naxatw-py-2 naxatw-text-left">
              <input
                type="checkbox"
                checked={
                  processableTasks.length > 0 &&
                  selectedTasks.size === processableTasks.length
                }
                onChange={toggleSelectAll}
                disabled={processableTasks.length === 0}
                className="naxatw-cursor-pointer"
              />
            </th>
            <th className="naxatw-px-3 naxatw-py-2 naxatw-text-left naxatw-font-medium naxatw-text-gray-600">
              {m.processing_dialog_table_task()}
            </th>
            <th className="naxatw-px-3 naxatw-py-2 naxatw-text-left naxatw-font-medium naxatw-text-gray-600">
              {m.processing_dialog_table_images()}
            </th>
            <th className="naxatw-px-3 naxatw-py-2 naxatw-text-left naxatw-font-medium naxatw-text-gray-600">
              {m.processing_dialog_table_status()}
            </th>
            <th className="naxatw-px-3 naxatw-py-2 naxatw-text-right naxatw-font-medium naxatw-text-gray-600">
              {m.processing_dialog_table_action()}
            </th>
          </tr>
        </thead>
        <tbody>
          {taskList.map((task, index: number) => {
            const isReprocess =
              task.state === 'IMAGE_PROCESSING_FINISHED' ||
              task.state === 'IMAGE_PROCESSING_FAILED';
            const canProcess =
              (isReprocess
                ? pendingTransferMap.get(task.task_id) !== true
                : readinessMap.get(task.task_id) === true) &&
              !processingTasks.has(task.task_id) &&
              task.state !== 'IMAGE_PROCESSING_STARTED';
            const isTaskProcessing =
              processingTasks.has(task.task_id) ||
              task.state === 'IMAGE_PROCESSING_STARTED';
            const displayState = isTaskProcessing
              ? 'IMAGE_PROCESSING_STARTED'
              : task.state;
            const stateColor = stateColors[displayState] || '#e5e7eb';
            // Imagery stuck in staging blocks processing; offer a resume.
            const transferPending =
              !isTaskProcessing &&
              pendingTransferMap.get(task.task_id) === true;
            const isTransferring = transferringTasks.has(task.task_id);
            const pendingTransferCount = task.pending_transfer_count ?? 0;

            return (
              <tr
                key={task.task_id}
                className="naxatw-border-b naxatw-border-gray-100 last:naxatw-border-0"
              >
                <td className="naxatw-px-3 naxatw-py-2">
                  <input
                    type="checkbox"
                    checked={selectedTasks.has(task.task_id)}
                    onChange={() => toggleTaskSelection(task.task_id)}
                    disabled={!canProcess}
                    className="naxatw-cursor-pointer disabled:naxatw-cursor-not-allowed disabled:naxatw-opacity-50"
                  />
                </td>
                <td className="naxatw-px-3 naxatw-py-2 naxatw-font-medium">
                  <div className="naxatw-flex naxatw-items-center naxatw-gap-1">
                    <span className="naxatw-whitespace-nowrap">
                      {m.processing_dialog_task_row_label({
                        index: task.task_index ?? index + 1,
                      })}
                    </span>
                    <button
                      type="button"
                      title={m.processing_dialog_copy_task_id_title()}
                      className="naxatw-flex naxatw-h-5 naxatw-w-5 naxatw-shrink-0 naxatw-items-center naxatw-justify-center naxatw-rounded naxatw-text-gray-400 hover:naxatw-bg-gray-100 hover:naxatw-text-gray-600"
                      onClick={() => handleCopyTaskId(task.task_id)}
                    >
                      <Icon name="content_copy" className="!naxatw-text-sm" />
                    </button>
                  </div>
                </td>
                <td className="naxatw-px-3 naxatw-py-2 naxatw-text-gray-600">
                  {m.processing_dialog_images_count({
                    count: task.image_count,
                  })}
                </td>
                <td className="naxatw-px-3 naxatw-py-2">
                  <div className="naxatw-flex naxatw-flex-col naxatw-items-start naxatw-gap-1">
                    <span
                      className="naxatw-inline-flex naxatw-items-center naxatw-gap-1 naxatw-rounded-full naxatw-px-2 naxatw-py-0.5 naxatw-text-xs naxatw-font-medium"
                      style={{
                        backgroundColor: `${stateColor}33`,
                        color: (() => {
                          if (displayState === 'IMAGE_PROCESSING_FINISHED')
                            return '#166534';
                          if (displayState === 'IMAGE_PROCESSING_FAILED')
                            return '#991b1b';
                          return '#374151';
                        })(),
                      }}
                    >
                      {isTaskProcessing && (
                        <Icon
                          name="sync"
                          className="naxatw-animate-spin !naxatw-text-sm"
                        />
                      )}
                      {displayState === 'IMAGE_PROCESSING_FINISHED' && '✓ '}
                      {formatString(displayState) ||
                        m.processing_dialog_no_images_state()}
                    </span>
                    {task.state === 'IMAGE_PROCESSING_FAILED' &&
                      task.failure_reason && (
                        <p className="naxatw-max-w-[320px] naxatw-text-xs naxatw-text-red-700">
                          {task.failure_reason}
                        </p>
                      )}
                    {transferPending && (
                      <p className="naxatw-max-w-[320px] naxatw-text-xs naxatw-text-amber-700">
                        {isTransferring
                          ? m.processing_dialog_transfer_in_progress()
                          : m.processing_dialog_transfer_incomplete({
                              count: pendingTransferCount,
                            })}
                      </p>
                    )}
                  </div>
                </td>
                <td className="naxatw-px-3 naxatw-py-2">
                  {isTaskProcessing ? (
                    <div className="naxatw-flex naxatw-justify-end">
                      <Icon
                        name="sync"
                        className="naxatw-animate-spin !naxatw-text-lg naxatw-text-gray-500"
                      />
                    </div>
                  ) : (
                    <div className="naxatw-flex naxatw-justify-end naxatw-gap-2">
                      {task.state === 'IMAGE_PROCESSING_FINISHED' &&
                      task.assets_url ? (
                        <>
                          {task.orthophoto_url ? (
                            <button
                              type="button"
                              title={m.processing_dialog_view_orthophoto_title()}
                              className="naxatw-flex naxatw-h-7 naxatw-w-7 naxatw-items-center naxatw-justify-center naxatw-rounded naxatw-text-emerald-600 hover:naxatw-bg-emerald-50"
                              onClick={() => {
                                setViewerTask({
                                  url: task.orthophoto_url!,
                                  title: `Task ${task.task_index} orthophoto`,
                                });
                              }}
                            >
                              <Icon
                                name="visibility"
                                className="!naxatw-text-base"
                              />
                            </button>
                          ) : null}
                          <button
                            type="button"
                            title={m.processing_dialog_download_orthophoto_title()}
                            className="naxatw-flex naxatw-h-7 naxatw-w-7 naxatw-items-center naxatw-justify-center naxatw-rounded naxatw-text-blue-600 hover:naxatw-bg-blue-50"
                            onClick={() => {
                              if (task.assets_url) {
                                handleDownloadOrtho(task.assets_url);
                              }
                            }}
                          >
                            <Icon
                              name="download"
                              className="!naxatw-text-base"
                            />
                          </button>
                          <button
                            type="button"
                            title={m.processing_dialog_download_assets_title()}
                            className="naxatw-flex naxatw-h-7 naxatw-w-7 naxatw-items-center naxatw-justify-center naxatw-rounded naxatw-text-gray-400 hover:naxatw-bg-gray-100"
                            onClick={() => {
                              if (task.assets_url) {
                                handleDownloadAssets(task.assets_url);
                              }
                            }}
                          >
                            <Icon
                              name="folder_zip"
                              className="!naxatw-text-base"
                            />
                          </button>
                        </>
                      ) : null}
                      {canProcess ? (
                        <Button
                          variant="ghost"
                          className="naxatw-h-7 naxatw-bg-red naxatw-px-2 naxatw-text-xs naxatw-text-white hover:naxatw-bg-red/90"
                          leftIcon={
                            task.state === 'IMAGE_PROCESSING_FAILED' ||
                            task.state === 'IMAGE_PROCESSING_FINISHED'
                              ? 'replay'
                              : 'play_arrow'
                          }
                          iconClassname="!naxatw-text-sm"
                          onClick={e => {
                            if (
                              isReprocess &&
                              // eslint-disable-next-line no-alert -- deliberate blocking confirm before a costly reprocess; no async confirm-modal exists in this codebase yet
                              !window.confirm(
                                m.processing_dialog_reprocess_confirm(),
                              )
                            ) {
                              return;
                            }
                            if (e.ctrlKey || e.metaKey) {
                              // eslint-disable-next-line no-alert -- deliberate synchronous prompt for an engineering-only ctrl/cmd-click override; no UI form exists for this
                              const odmUrl = window.prompt(
                                m.processing_dialog_scaleodm_prompt(),
                              );
                              if (odmUrl !== null) {
                                void handleProcessSingle(
                                  task.task_id,
                                  odmUrl || undefined,
                                );
                              }
                            } else {
                              void handleProcessSingle(task.task_id);
                            }
                          }}
                        >
                          {getProcessButtonLabel(task)}
                        </Button>
                      ) : null}
                      {transferPending ? (
                        <Button
                          variant="ghost"
                          className="naxatw-h-7 naxatw-border naxatw-border-amber-500 naxatw-px-2 naxatw-text-xs naxatw-text-amber-700 hover:naxatw-bg-amber-50 disabled:naxatw-opacity-60"
                          leftIcon={isTransferring ? 'sync' : 'cloud_upload'}
                          iconClassname={
                            isTransferring
                              ? '!naxatw-text-sm naxatw-animate-spin'
                              : '!naxatw-text-sm'
                          }
                          disabled={isTransferring}
                          title={m.processing_dialog_transfer_resume_title()}
                          onClick={() => handleRetryTransfer(task.task_id)}
                        >
                          {isTransferring
                            ? m.processing_dialog_transfer_resuming()
                            : m.processing_dialog_transfer_resume()}
                        </Button>
                      ) : null}
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
