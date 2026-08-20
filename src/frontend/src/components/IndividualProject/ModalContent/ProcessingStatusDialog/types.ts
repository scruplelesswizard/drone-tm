export const stateColors: Record<string, string> = {
  READY_FOR_PROCESSING: '#9ec7ff',
  IMAGE_PROCESSING_STARTED: '#9C77B2',
  IMAGE_PROCESSING_FINISHED: '#176149',
  IMAGE_PROCESSING_FAILED: '#D73F3F',
  LOCKED: '#98BBC8',
  HAS_ISSUES: '#D73F3F',
};

export type ProcessingDialogTask = {
  task_id: string;
  task_index: number;
  image_count: number;
  state: string;
  failure_reason?: string | null;
  assets_url?: string | null;
  orthophoto_url?: string | null;
  pending_transfer_count?: number;
};

export type ProcessingDialogProjectDetail = {
  id?: string;
  total_task_count?: number;
  has_gcp?: boolean;
  image_processing_status?: string;
  orthophoto_url?: string | null;
  dsm_url?: string | null;
  dtm_url?: string | null;
  pointcloud_url?: string | null;
  assets_url?: string | null;
};
