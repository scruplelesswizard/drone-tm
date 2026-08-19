import { RefObject } from 'react';
import { Button } from '@Components/RadixComponents/Button';
import { m } from '@/paraglide/messages';

interface GcpStatusCardProps {
  hasSavedGcp: boolean;
  isUploadingGcp: boolean;
  gcpFileInputRef: RefObject<HTMLInputElement | null>;
  onOpenGcpEditor: () => void;
  onGcpFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export default function GcpStatusCard({
  hasSavedGcp,
  isUploadingGcp,
  gcpFileInputRef,
  onOpenGcpEditor,
  onGcpFileUpload,
}: GcpStatusCardProps) {
  return (
    <div
      className={`naxatw-w-full naxatw-rounded-lg naxatw-border naxatw-px-4 naxatw-py-3 naxatw-text-sm ${
        hasSavedGcp
          ? 'naxatw-border-green-200 naxatw-bg-green-50 naxatw-text-green-800'
          : 'naxatw-border-gray-200 naxatw-bg-gray-50 naxatw-text-gray-700'
      }`}
    >
      <div className="naxatw-flex naxatw-items-start naxatw-justify-between naxatw-gap-3">
        <div className="naxatw-flex naxatw-items-start naxatw-gap-2">
          <span className="material-icons naxatw-mt-0.5 !naxatw-text-base">
            {hasSavedGcp ? 'check_circle' : 'pin_drop'}
          </span>
          <div>
            <p className="naxatw-font-medium">
              {hasSavedGcp
                ? m.processing_dialog_gcp_saved()
                : m.processing_dialog_gcp_not_yet()}
            </p>
            <p className="naxatw-mt-1 naxatw-text-xs naxatw-opacity-80">
              {hasSavedGcp
                ? m.processing_dialog_gcp_saved_help()
                : m.processing_dialog_gcp_not_yet_help()}
            </p>
          </div>
        </div>
        <div className="naxatw-flex naxatw-shrink-0 naxatw-gap-2">
          <Button
            variant="outline"
            className="naxatw-h-8 naxatw-border-red naxatw-px-3 naxatw-text-xs naxatw-text-red"
            leftIcon="pin_drop"
            iconClassname="!naxatw-text-sm"
            onClick={onOpenGcpEditor}
          >
            {hasSavedGcp
              ? m.processing_dialog_edit_gcp()
              : m.processing_dialog_gcp_editor()}
          </Button>
          <Button
            variant="outline"
            className="naxatw-h-8 naxatw-border-gray-400 naxatw-px-3 naxatw-text-xs naxatw-text-gray-700"
            leftIcon="upload_file"
            iconClassname="!naxatw-text-sm"
            onClick={() => gcpFileInputRef.current?.click()}
            disabled={isUploadingGcp}
          >
            {(() => {
              if (isUploadingGcp) return m.common_uploading();
              if (hasSavedGcp) return m.processing_dialog_replace_gcp_txt();
              return m.processing_dialog_upload_gcp_txt();
            })()}
          </Button>
          <input
            ref={gcpFileInputRef}
            type="file"
            accept=".txt"
            className="naxatw-hidden"
            onChange={onGcpFileUpload}
          />
        </div>
      </div>
    </div>
  );
}
