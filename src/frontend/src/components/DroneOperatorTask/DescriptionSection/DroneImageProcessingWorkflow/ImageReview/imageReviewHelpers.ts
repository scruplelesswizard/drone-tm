// Pure helpers extracted verbatim from ImageReview.tsx - no closures over
// component state, safe to share between the main component and
// AccordionList.tsx.

export const hasIssueStatus = (status?: string) => status !== 'assigned';
export const canManuallyMatchImage = (status?: string) =>
  status === 'unmatched';
export const canOverrideImageRejection = (status?: string) =>
  status === 'rejected' || status === 'invalid_exif';
export const canRejectImage = (status?: string) => status === 'assigned';

export function getImageTileBorderClass(
  isAnchor: boolean,
  isSelected: boolean,
  isHighlighted: boolean,
  status?: string,
): string {
  if (isAnchor)
    return 'naxatw-border-amber-600 naxatw-ring-2 naxatw-ring-amber-400';
  if (isSelected)
    return 'naxatw-border-violet-600 naxatw-ring-2 naxatw-ring-violet-300';
  if (isHighlighted)
    return 'naxatw-border-blue-500 naxatw-ring-2 naxatw-ring-blue-300';
  if (status === 'rejected' || status === 'invalid_exif')
    return 'naxatw-border-red-300 hover:naxatw-border-red-500';
  if (status === 'unmatched')
    return 'naxatw-border-yellow-300 hover:naxatw-border-yellow-500';
  if (status === 'duplicate')
    return 'naxatw-border-gray-400 naxatw-opacity-60 hover:naxatw-border-gray-600';
  return 'naxatw-border-gray-200 hover:naxatw-border-blue-500';
}

const escapeHtml = (str: string): string => {
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
};

const escapeAttr = (str: string): string =>
  str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

export function buildPopupHtml(props: {
  id: string;
  filename: string;
  status: string;
  rejection_reason?: string;
}) {
  const statusColors: Record<string, string> = {
    assigned: '#22c55e',
    rejected: '#D73F3F',
    unmatched: '#eab308',
    invalid_exif: '#f97316',
    duplicate: '#6b7280',
  };
  const dotColor = statusColors[props.status] || '#3b82f6';
  const showMatchBtn = canManuallyMatchImage(props.status);
  const btnStyle =
    'display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:4px;font-size:11px;font-weight:600;cursor:pointer;border:none;margin-top:8px;margin-right:6px;';
  const safeFilename = escapeHtml(props.filename || 'Unknown');
  const safeFilenameAttr = escapeAttr(props.filename || '');
  const safeReason = props.rejection_reason
    ? escapeHtml(props.rejection_reason)
    : '';
  const safeId = escapeAttr(props.id);
  return `
      <div style="min-width:180px;max-width:280px;font-family:system-ui,sans-serif;">
        <div style="font-size:13px;font-weight:600;margin-bottom:4px;word-break:break-all;">${safeFilename}</div>
        <div style="display:flex;align-items:center;gap:6px;font-size:12px;color:#555;">
          <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${dotColor};"></span>
          ${escapeHtml((props.status || 'unknown').replace('_', ' '))}
        </div>
${safeReason && ['rejected', 'unmatched', 'invalid_exif', 'duplicate'].includes(props.status) ? `<div style="font-size:11px;color:#b91c1c;margin-top:4px;">${safeReason}</div>` : ''}
        <div>
          <button data-inspect-image-id="${safeId}" style="${btnStyle}background:#2563eb;color:white;">
            <span class="material-icons" style="font-size:14px;">visibility</span> Inspect
          </button>
          ${
            showMatchBtn
              ? `<button data-match-image-id="${safeId}" data-match-image-filename="${safeFilenameAttr}" style="${btnStyle}background:#eab308;color:white;">
            <span class="material-icons" style="font-size:14px;">my_location</span> Match to task
          </button>`
              : ''
          }
        </div>
      </div>
    `;
}

// Run async `worker` over `items` with at most `limit` in-flight at a time.
// Each worker rejection is counted, never thrown - caller gets success/fail tallies.
export const BULK_CONCURRENCY = 8;
export const runWithConcurrency = async <T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<{ successCount: number; failCount: number }> => {
  let successCount = 0;
  let failCount = 0;
  let cursor = 0;
  const runners = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (cursor < items.length) {
        const idx = cursor++;
        try {
          // eslint-disable-next-line no-await-in-loop -- this loop body IS the bounded-concurrency worker; parallelism comes from running `limit` of these loops concurrently, not from awaiting items in parallel here
          await worker(items[idx]);
          successCount++;
        } catch {
          failCount++;
        }
      }
    },
  );
  await Promise.all(runners);
  return { successCount, failCount };
};
