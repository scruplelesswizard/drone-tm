import { useRef, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  getTaskImageUrls,
  getBulkImageUrls,
  TaskGroup,
  TaskGroupImage,
  ImageUrls,
} from '@Services/classification';
import { FlexRow } from '@Components/common/Layouts';
import Accordion from '@Components/common/Accordion';
import { Button } from '@Components/RadixComponents/Button';
import { m } from '@/paraglide/messages';
import { getImageTileBorderClass } from './imageReviewHelpers';

// Hook to fetch presigned URLs for a task on demand
const useTaskImageUrls = (
  projectId: string,
  taskId: string | null,
  enabled: boolean,
) => {
  return useQuery({
    queryKey: ['taskImageUrls', projectId, taskId],
    queryFn: () => getTaskImageUrls(projectId, taskId!),
    enabled: enabled && !!taskId,
    staleTime: 30 * 60 * 1000, // 30 min (presigned URLs last 1 hour)
  });
};

// Accordion content that lazy-loads presigned thumbnail URLs when opened
const TaskAccordionContent = ({
  group,
  groupKey,
  projectId,
  isOpen,
  highlightedImageId,
  selectedImageIds,
  anchorImageId,
  imageRefs,
  onVerifyTask,
  onCleanup,
  onImageClick,
  onImageDoubleClick,
}: {
  group: TaskGroup;
  groupKey: string;
  projectId: string;
  isOpen: boolean;
  highlightedImageId: string | null;
  selectedImageIds: Set<string>;
  anchorImageId: string | null;
  imageRefs: React.MutableRefObject<Record<string, HTMLDivElement | null>>;
  onVerifyTask: (taskId: string, taskIndex: number) => void;
  onCleanup: () => void;
  onImageClick: (
    image: TaskGroupImage,
    event: React.MouseEvent,
    groupImages: TaskGroupImage[],
    groupKey: string,
    imageUrls?: Record<string, ImageUrls>,
  ) => void;
  onImageDoubleClick: (
    image: TaskGroupImage,
    imageUrls?: Record<string, ImageUrls>,
  ) => void;
}) => {
  const COLS = 6;
  const ROW_H = 110;

  // Fetch presigned URLs only when accordion is open
  // For assigned tasks, use the task endpoint; for unassigned, use bulk by image IDs
  const { data: urlsData } = useTaskImageUrls(projectId, group.task_id, isOpen);
  const groupImageIds = useMemo(
    () => group.images.map(i => i.id),
    [group.images],
  );
  const bulkKey = useMemo(
    () => [...groupImageIds].sort().join(','),
    [groupImageIds],
  );
  const { data: bulkUrlsData } = useQuery({
    queryKey: ['bulkImageUrls', projectId, bulkKey],
    queryFn: () => getBulkImageUrls(projectId, groupImageIds),
    enabled: isOpen && !group.task_id && groupImageIds.length > 0,
    staleTime: 30 * 60 * 1000,
  });

  // Build a lookup map: image_id -> { thumbnail_url, url }
  const urlSource = group.task_id ? urlsData?.images : bulkUrlsData?.images;
  const imageUrlMap = useMemo(() => {
    const map: Record<string, ImageUrls> = {};
    if (urlSource) {
      urlSource.forEach(img => {
        map[img.id] = img;
      });
    }
    return map;
  }, [urlSource]);

  // Virtualization
  const parentRef = useRef<HTMLDivElement>(null);
  const rows = useMemo(() => {
    const result: TaskGroupImage[][] = [];
    for (let i = 0; i < group.images.length; i += COLS) {
      result.push(group.images.slice(i, i + COLS));
    }
    return result;
  }, [group.images]);

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_H,
    overscan: 3,
  });

  return (
    <>
      {group.task_id ? (
        <div className="naxatw-mb-4">
          <Button
            variant="ghost"
            className="naxatw-bg-green-600 naxatw-text-white hover:naxatw-bg-green-700"
            leftIcon="map"
            onClick={e => {
              e.stopPropagation();
              onVerifyTask(group.task_id!, group.project_task_index || 0);
            }}
          >
            {m.image_review_verify_task_on_map()}
          </Button>
        </div>
      ) : (
        <div className="naxatw-mb-4">
          <Button
            variant="ghost"
            className="naxatw-bg-red naxatw-text-white"
            leftIcon="delete"
            onClick={e => {
              e.stopPropagation();
              onCleanup();
            }}
          >
            {m.image_review_cleanup_invalid_imagery()}
          </Button>
        </div>
      )}

      {/* Virtualized Image Grid */}
      <div
        ref={parentRef}
        className="naxatw-overflow-auto naxatw-rounded"
        style={{ maxHeight: `${Math.min(rows.length * ROW_H, 440)}px` }}
      >
        <div
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {rowVirtualizer.getVirtualItems().map(virtualRow => {
            const rowImages = rows[virtualRow.index];
            return (
              <div
                key={virtualRow.key}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
                className="naxatw-grid naxatw-grid-cols-6 naxatw-gap-2 naxatw-px-0.5"
              >
                {rowImages.map(image => {
                  const urls = imageUrlMap[image.id];
                  const thumbSrc = urls?.thumbnail_url || urls?.url;
                  const isSelected = selectedImageIds.has(image.id);
                  const isAnchor = anchorImageId === image.id;
                  return (
                    <div
                      key={image.id}
                      role="button"
                      tabIndex={0}
                      ref={el => {
                        // eslint-disable-next-line no-param-reassign -- populating a ref map via callback ref is the standard React pattern
                        imageRefs.current[image.id] = el;
                      }}
                      className={`naxatw-group naxatw-relative naxatw-aspect-square naxatw-cursor-pointer naxatw-overflow-hidden naxatw-rounded naxatw-border-2 naxatw-transition-all hover:naxatw-shadow-md ${getImageTileBorderClass(
                        isAnchor,
                        isSelected,
                        highlightedImageId === image.id,
                        image.status,
                      )}`}
                      onClick={e =>
                        onImageClick(
                          image,
                          e,
                          group.images,
                          groupKey,
                          imageUrlMap,
                        )
                      }
                      // Selection here relies on mouse-only ctrl/meta-click
                      // modifiers (see handleSidebarImageClick); no keyboard
                      // equivalent exists yet, so this is a no-op that only
                      // satisfies the interactive-role contract.
                      onKeyDown={() => {}}
                      onDoubleClick={() =>
                        onImageDoubleClick(image, imageUrlMap)
                      }
                      title={`${image.filename}${image.rejection_reason ? ` - ${image.rejection_reason}` : ''}`}
                    >
                      {(() => {
                        if (thumbSrc)
                          return (
                            <img
                              src={thumbSrc}
                              alt={image.filename}
                              className="naxatw-h-full naxatw-w-full naxatw-object-cover"
                              loading="lazy"
                            />
                          );
                        if (image.status === 'duplicate')
                          return (
                            <div className="naxatw-flex naxatw-h-full naxatw-w-full naxatw-flex-col naxatw-items-center naxatw-justify-center naxatw-bg-gray-100 naxatw-text-gray-400">
                              <span className="material-icons naxatw-text-2xl">
                                content_copy
                              </span>
                              <span className="naxatw-mt-0.5 naxatw-text-[9px]">
                                {m.common_duplicate()}
                              </span>
                            </div>
                          );
                        return (
                          <div className="naxatw-flex naxatw-h-full naxatw-w-full naxatw-items-center naxatw-justify-center naxatw-bg-gray-100">
                            <div className="naxatw-h-5 naxatw-w-5 naxatw-animate-spin naxatw-rounded-full naxatw-border-2 naxatw-border-gray-300 naxatw-border-t-blue-500" />
                          </div>
                        );
                      })()}
                      {(image.status === 'rejected' ||
                        image.status === 'invalid_exif') && (
                        <div className="naxatw-absolute naxatw-bottom-0 naxatw-left-0 naxatw-right-0 naxatw-truncate naxatw-bg-red-500 naxatw-bg-opacity-75 naxatw-px-1 naxatw-py-0.5 naxatw-text-center naxatw-text-[10px] naxatw-text-white">
                          {image.rejection_reason || m.common_rejected()}
                        </div>
                      )}
                      {image.status === 'unmatched' && (
                        <div className="naxatw-absolute naxatw-bottom-0 naxatw-left-0 naxatw-right-0 naxatw-bg-yellow-500 naxatw-bg-opacity-75 naxatw-px-1 naxatw-py-0.5 naxatw-text-center naxatw-text-[10px] naxatw-text-white">
                          {m.common_unmatched()}
                        </div>
                      )}
                      {image.status === 'duplicate' && (
                        <div className="naxatw-absolute naxatw-bottom-0 naxatw-left-0 naxatw-right-0 naxatw-bg-gray-500 naxatw-bg-opacity-75 naxatw-px-1 naxatw-py-0.5 naxatw-text-center naxatw-text-[10px] naxatw-text-white">
                          {m.common_duplicate()}
                        </div>
                      )}
                      <div className="naxatw-absolute naxatw-inset-0 naxatw-bg-black naxatw-opacity-0 naxatw-transition-opacity group-hover:naxatw-opacity-10" />
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
};

// Virtualized list of task accordions. Previously every task accordion (header
// + collapsed body) was mounted into the DOM up-front, which for projects with
// hundreds of tasks added significant first-paint cost. The virtualizer keeps
// only visible rows mounted; open state is tracked by the parent via
// `openAccordions`, so a row scrolling out and back in restores correctly.
const VirtualizedAccordionList = ({
  groups,
  openAccordions,
  setOpenAccordions,
  showOnlyIssueImages,
  projectId,
  highlightedImageId,
  selectedImageIds,
  sequenceSelectMode,
  sequenceAnchor,
  imageRefs,
  onVerifyTask,
  onCleanup,
  onImageClick,
  onImageDoubleClick,
}: {
  groups: TaskGroup[];
  openAccordions: Set<string>;
  setOpenAccordions: React.Dispatch<React.SetStateAction<Set<string>>>;
  showOnlyIssueImages: boolean;
  projectId: string;
  highlightedImageId: string | null;
  selectedImageIds: Set<string>;
  sequenceSelectMode: boolean;
  sequenceAnchor: { imageId: string; groupKey: string } | null;
  imageRefs: React.MutableRefObject<Record<string, HTMLDivElement | null>>;
  onVerifyTask: (taskId: string, taskIndex: number) => void;
  onCleanup: () => void;
  onImageClick: (
    image: TaskGroupImage,
    event: React.MouseEvent,
    groupImages: TaskGroupImage[],
    groupKey: string,
    imageUrls?: Record<string, ImageUrls>,
  ) => void;
  onImageDoubleClick: (
    image: TaskGroupImage,
    imageUrls?: Record<string, ImageUrls>,
  ) => void;
}) => {
  const parentRef = useRef<HTMLDivElement | null>(null);
  // Approximate collapsed-row height; open rows are measured dynamically.
  const ESTIMATED_ROW_H = 72;
  const virtualizer = useVirtualizer({
    count: groups.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ESTIMATED_ROW_H,
    overscan: 4,
    getItemKey: i => groups[i].task_id || `unassigned-${i}`,
  });

  return (
    <div ref={parentRef} className="naxatw-h-full naxatw-overflow-auto">
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map(virtualRow => {
          const group = groups[virtualRow.index];
          const accordionKey =
            group.task_id || `unassigned-${virtualRow.index}`;
          const isAccordionOpen = openAccordions.has(accordionKey);
          return (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <Accordion
                open={isAccordionOpen}
                className="!naxatw-border-b !naxatw-border-gray-300 !naxatw-py-4"
                headerClassName="!naxatw-items-start"
                contentClassName="naxatw-mt-4"
                onToggle={(open: boolean) => {
                  setOpenAccordions(prev => {
                    const next = new Set(prev);
                    if (open) next.add(accordionKey);
                    else next.delete(accordionKey);
                    return next;
                  });
                }}
                title={
                  <FlexRow className="naxatw-flex-wrap naxatw-items-center naxatw-gap-3">
                    <h4 className="naxatw-text-base naxatw-font-semibold naxatw-text-gray-900">
                      {group.task_id
                        ? m.common_task_number({
                            index: group.project_task_index ?? '',
                          })
                        : m.image_review_unassigned_images()}
                    </h4>
                    <span className="naxatw-rounded-full naxatw-bg-blue-100 naxatw-px-3 naxatw-py-1 naxatw-text-sm naxatw-font-medium naxatw-text-blue-800">
                      {showOnlyIssueImages
                        ? `${group.images.length} ${
                            group.images.length === 1
                              ? m.common_issue()
                              : m.common_issues_lower()
                          }`
                        : `${group.images.length} ${
                            group.images.length === 1
                              ? m.common_image()
                              : m.common_images_lower()
                          }`}
                    </span>
                    {group.is_verified && (
                      <span className="naxatw-rounded-full naxatw-bg-green-100 naxatw-px-3 naxatw-py-1 naxatw-text-sm naxatw-font-medium naxatw-text-green-800">
                        {m.common_fully_flown()}
                      </span>
                    )}
                  </FlexRow>
                }
              >
                <TaskAccordionContent
                  group={group}
                  groupKey={accordionKey}
                  projectId={projectId}
                  isOpen={isAccordionOpen}
                  highlightedImageId={highlightedImageId}
                  selectedImageIds={selectedImageIds}
                  anchorImageId={
                    sequenceSelectMode &&
                    sequenceAnchor?.groupKey === accordionKey
                      ? sequenceAnchor.imageId
                      : null
                  }
                  imageRefs={imageRefs}
                  onVerifyTask={onVerifyTask}
                  onCleanup={onCleanup}
                  onImageClick={onImageClick}
                  onImageDoubleClick={onImageDoubleClick}
                />
              </Accordion>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default VirtualizedAccordionList;
