import { FallbackProps } from 'react-error-boundary';
import Icon from '@Components/common/Icon';
import { m } from '@/paraglide/messages';

/**
 * Last-resort fallback for the app-root ErrorBoundary in main.tsx. Most
 * components are already individually wrapped via utils/hasErrorBoundary,
 * so this only fires for errors outside any of those subtrees (routing,
 * providers, etc).
 */
export default function AppErrorFallback({
  error,
  resetErrorBoundary,
}: FallbackProps) {
  return (
    <div className="naxatw-flex naxatw-h-screen naxatw-w-screen naxatw-flex-col naxatw-items-center naxatw-justify-center naxatw-gap-3 naxatw-bg-white naxatw-p-8 naxatw-text-center">
      <Icon
        name="running_with_errors"
        className="naxatw-text-6xl naxatw-text-red-600"
      />
      <p className="naxatw-text-xl naxatw-font-bold naxatw-text-gray-800">
        {m.common_error_occurred()}
      </p>
      {error instanceof Error && error.message && (
        <p className="naxatw-max-w-md naxatw-break-words naxatw-text-sm naxatw-text-gray-500">
          {m.common_error_label({ message: error.message })}
        </p>
      )}
      <button
        type="button"
        onClick={resetErrorBoundary}
        className="naxatw-bg-red-600 naxatw-rounded naxatw-px-4 naxatw-py-2 naxatw-text-sm naxatw-font-semibold naxatw-text-white"
      >
        {m.common_retry()}
      </button>
    </div>
  );
}
