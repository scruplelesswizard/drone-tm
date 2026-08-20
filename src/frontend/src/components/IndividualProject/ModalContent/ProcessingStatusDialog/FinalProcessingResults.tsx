import { Button } from '@Components/RadixComponents/Button';
import { m } from '@/paraglide/messages';
import { ProcessingDialogProjectDetail } from './types';

interface FinalProcessingResultsProps {
  projectDetail: ProcessingDialogProjectDetail;
  projectId: string;
  onDownloadProjectFile: (url: string, filename: string) => void;
}

export default function FinalProcessingResults({
  projectDetail,
  projectId,
  onDownloadProjectFile,
}: FinalProcessingResultsProps) {
  return (
    <>
      <hr className="naxatw-border-gray-200" />
      <div>
        <h3 className="naxatw-text-sm naxatw-font-semibold naxatw-text-gray-800">
          {m.processing_dialog_final_results_title()}
        </h3>
        <p className="naxatw-mt-1 naxatw-text-xs naxatw-text-gray-500">
          {m.processing_dialog_final_results_desc()}
        </p>
      </div>
      <div className="naxatw-flex naxatw-flex-wrap naxatw-gap-2">
        {projectDetail.orthophoto_url && (
          <Button
            variant="outline"
            className="naxatw-h-8 naxatw-border-blue-300 naxatw-px-3 naxatw-text-xs naxatw-text-blue-700"
            leftIcon="download"
            iconClassname="!naxatw-text-sm"
            onClick={() =>
              onDownloadProjectFile(
                projectDetail.orthophoto_url!,
                `orthophoto_${projectId}.tif`,
              )
            }
          >
            {m.processing_dialog_orthophoto_tif()}
          </Button>
        )}
        {projectDetail.dsm_url && (
          <Button
            variant="outline"
            className="naxatw-h-8 naxatw-border-blue-300 naxatw-px-3 naxatw-text-xs naxatw-text-blue-700"
            leftIcon="download"
            iconClassname="!naxatw-text-sm"
            onClick={() =>
              onDownloadProjectFile(
                projectDetail.dsm_url!,
                `dsm_${projectId}.tif`,
              )
            }
          >
            {m.processing_dialog_dsm_tif()}
          </Button>
        )}
        {projectDetail.dtm_url && (
          <Button
            variant="outline"
            className="naxatw-h-8 naxatw-border-blue-300 naxatw-px-3 naxatw-text-xs naxatw-text-blue-700"
            leftIcon="download"
            iconClassname="!naxatw-text-sm"
            onClick={() =>
              onDownloadProjectFile(
                projectDetail.dtm_url!,
                `dtm_${projectId}.tif`,
              )
            }
          >
            {m.processing_dialog_dtm_tif()}
          </Button>
        )}
        {projectDetail.pointcloud_url && (
          <Button
            variant="outline"
            className="naxatw-h-8 naxatw-border-blue-300 naxatw-px-3 naxatw-text-xs naxatw-text-blue-700"
            leftIcon="download"
            iconClassname="!naxatw-text-sm"
            onClick={() =>
              onDownloadProjectFile(
                projectDetail.pointcloud_url!,
                `pointcloud_${projectId}.laz`,
              )
            }
          >
            {m.processing_dialog_pointcloud_laz()}
          </Button>
        )}
      </div>
    </>
  );
}
