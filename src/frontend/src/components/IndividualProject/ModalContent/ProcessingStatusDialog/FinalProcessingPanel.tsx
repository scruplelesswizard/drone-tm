import { Button } from '@Components/RadixComponents/Button';
import Icon from '@Components/common/Icon';
import { m } from '@/paraglide/messages';

interface FinalProcessingPanelProps {
  finalProcessingDisabledReason: string;
  allTasksProcessed: boolean;
  coveragePercentage: number;
  isCoverageFetching: boolean;
  tasksReady: number;
  totalTaskCount: number;
  isFinalProcessingRunning: boolean;
  isProcessingAll: boolean;
  isTaskSummaryFetching: boolean;
  projectImageProcessingStatus?: string;
  totalProcessable: number;
  tasksWithImagery: number;
  onStartFinalProcessing: (withGcp: boolean, capacityType?: string) => void;
}

export default function FinalProcessingPanel({
  finalProcessingDisabledReason,
  allTasksProcessed,
  coveragePercentage,
  isCoverageFetching,
  tasksReady,
  totalTaskCount,
  isFinalProcessingRunning,
  isProcessingAll,
  isTaskSummaryFetching,
  projectImageProcessingStatus,
  totalProcessable,
  tasksWithImagery,
  onStartFinalProcessing,
}: FinalProcessingPanelProps) {
  return (
    <div className="naxatw-flex naxatw-flex-col naxatw-items-center naxatw-gap-2">
      {finalProcessingDisabledReason && (
        <p className="naxatw-text-center naxatw-text-xs naxatw-text-amber-700">
          {finalProcessingDisabledReason}
        </p>
      )}
      {!finalProcessingDisabledReason && !allTasksProcessed && (
        <div
          className={`naxatw-w-full naxatw-rounded-lg naxatw-border naxatw-px-4 naxatw-py-3 naxatw-text-xs ${
            coveragePercentage < 90
              ? 'naxatw-border-amber-200 naxatw-bg-amber-50 naxatw-text-amber-800'
              : 'naxatw-border-blue-200 naxatw-bg-blue-50 naxatw-text-blue-800'
          }`}
        >
          <p className="naxatw-font-semibold">
            {m.processing_dialog_coverage_percentage({
              percentage: coveragePercentage,
            })}
            {isCoverageFetching &&
              ` ${m.processing_dialog_coverage_calculating()}`}
          </p>
          <p className="naxatw-mt-0.5">
            {m.processing_dialog_tasks_ready_for_processing({
              ready: tasksReady,
              total: totalTaskCount,
            })}
          </p>
          {coveragePercentage < 90 && (
            <p className="naxatw-mt-1">
              {m.processing_dialog_coverage_below_warning()}
            </p>
          )}
        </div>
      )}
      {isFinalProcessingRunning && (
        <div className="naxatw-flex naxatw-items-center naxatw-gap-2 naxatw-text-sm naxatw-text-gray-600">
          <Icon name="sync" className="naxatw-animate-spin !naxatw-text-base" />
          <span>
            {isProcessingAll
              ? m.processing_dialog_final_submitting()
              : m.processing_dialog_final_in_progress()}
          </span>
        </div>
      )}
      {!isFinalProcessingRunning &&
        projectImageProcessingStatus === 'FAILED' && (
          <div className="naxatw-flex naxatw-items-start naxatw-gap-2 naxatw-text-sm naxatw-text-red-700">
            <Icon name="error" className="!naxatw-text-base" />
            <span>{m.processing_dialog_final_failed()}</span>
          </div>
        )}
      <Button
        variant="ghost"
        className="naxatw-bg-red naxatw-px-8 naxatw-py-2 naxatw-text-white disabled:naxatw-bg-gray-400"
        leftIcon={isFinalProcessingRunning ? 'sync' : 'play_arrow'}
        iconClassname={isFinalProcessingRunning ? 'naxatw-animate-spin' : ''}
        onClick={e => {
          const onDemand = e.ctrlKey || e.metaKey;
          let confirmMessage: string = m.processing_dialog_final_confirm_intro({
            processable: totalProcessable,
            total: totalTaskCount,
          });

          if (tasksWithImagery > 0) {
            confirmMessage += m.processing_dialog_final_confirm_unverified({
              count: tasksWithImagery,
            });
          }

          if (!allTasksProcessed && coveragePercentage < 90) {
            confirmMessage +=
              m.processing_dialog_final_confirm_coverage_warning({
                percentage: coveragePercentage,
              });
          }

          if (onDemand) {
            confirmMessage += m.processing_dialog_final_confirm_ondemand();
          }

          confirmMessage += m.processing_dialog_final_confirm_proceed();

          // eslint-disable-next-line no-alert -- deliberate blocking confirm before irreversible final processing
          if (!window.confirm(confirmMessage)) return;
          onStartFinalProcessing(false, onDemand ? 'on-demand' : undefined);
        }}
        disabled={
          Boolean(finalProcessingDisabledReason) ||
          isFinalProcessingRunning ||
          isTaskSummaryFetching ||
          isCoverageFetching
        }
      >
        {(() => {
          if (isFinalProcessingRunning) return m.common_processing_ellipsis();
          if (isTaskSummaryFetching || isCoverageFetching)
            return m.common_refreshing();
          return m.processing_dialog_start_final_processing();
        })()}
      </Button>
    </div>
  );
}
