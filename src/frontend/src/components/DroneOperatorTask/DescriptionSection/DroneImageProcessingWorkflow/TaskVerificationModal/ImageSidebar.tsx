import { MutableRefObject, RefObject } from 'react';
import { Virtualizer } from '@tanstack/react-virtual';
import { UseMutationResult } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { ImageUrls, TaskImageData } from '@Services/classification';
import { m } from '@/paraglide/messages';

interface ImageSidebarProps {
  imageCount: number;
  sidebarParentRef: RefObject<HTMLDivElement | null>;
  sidebarVirtualizer: Virtualizer<HTMLDivElement, Element>;
  sidebarRows: TaskImageData[][];
  imageUrlMap: Record<string, ImageUrls>;
  selectedImageId: string | null;
  imageRefs: MutableRefObject<Record<string, HTMLDivElement | null>>;
  onImageClick: (imageId: string) => void;
  deleteMutation: UseMutationResult<unknown, AxiosError, string>;
}

// Virtualized sidebar image grid, extracted verbatim from
// TaskVerificationModal's JSX. State/mutations still live in the parent.
export default function ImageSidebar({
  imageCount,
  sidebarParentRef,
  sidebarVirtualizer,
  sidebarRows,
  imageUrlMap,
  selectedImageId,
  imageRefs,
  onImageClick,
  deleteMutation,
}: ImageSidebarProps) {
  return (
    <div className="naxatw-flex naxatw-w-80 naxatw-flex-col naxatw-border-l">
      <div className="naxatw-p-4 naxatw-pb-2">
        <h4 className="naxatw-text-sm naxatw-font-semibold naxatw-text-gray-700">
          {m.common_images_count({ count: imageCount })}
        </h4>
      </div>
      <div
        ref={sidebarParentRef}
        className="naxatw-flex-1 naxatw-overflow-auto naxatw-px-4 naxatw-pb-4"
      >
        <div
          style={{
            height: `${sidebarVirtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {sidebarVirtualizer.getVirtualItems().map(virtualRow => {
            const rowImages = sidebarRows[virtualRow.index];
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
                className="naxatw-grid naxatw-grid-cols-2 naxatw-gap-2"
              >
                {rowImages.map(image => {
                  const urls = imageUrlMap[image.id];
                  const thumbSrc = urls?.thumbnail_url || urls?.url;
                  return (
                    <div
                      key={image.id}
                      role="button"
                      tabIndex={0}
                      ref={el => {
                        // eslint-disable-next-line no-param-reassign -- mutating a ref's .current is the standard React pattern, not a real param-reassign concern
                        imageRefs.current[image.id] = el;
                      }}
                      className={`naxatw-group naxatw-relative naxatw-aspect-square naxatw-cursor-pointer naxatw-overflow-hidden naxatw-rounded naxatw-border-2 naxatw-transition-all hover:naxatw-shadow-md ${
                        selectedImageId === image.id
                          ? 'naxatw-border-blue-500 naxatw-ring-2 naxatw-ring-blue-200'
                          : 'naxatw-border-gray-200'
                      }`}
                      onClick={() => onImageClick(image.id)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          onImageClick(image.id);
                        }
                      }}
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
                      <button
                        type="button"
                        className="naxatw-bg-red-500 hover:naxatw-bg-red-600 naxatw-absolute naxatw-right-1 naxatw-top-1 naxatw-rounded-full naxatw-p-1 naxatw-text-white naxatw-opacity-0 naxatw-transition-opacity group-hover:naxatw-opacity-100"
                        onClick={e => {
                          e.stopPropagation();
                          deleteMutation.mutate(image.id);
                        }}
                        title={m.task_verification_delete_image_title()}
                      >
                        <span className="material-icons naxatw-text-sm">
                          close
                        </span>
                      </button>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
