import { ProjectInfo } from '@Services/createproject';
import Skeleton from '@Components/RadixComponents/Skeleton';
import NoDataComponent from '@Components/common/DataTable/NoDataFound';
import { m } from '@/paraglide/messages';

export default function Instructions({
  projectData,
  isProjectDataLoading,
}: {
  projectData: ProjectInfo;
  isProjectDataLoading: boolean;
}) {
  const renderContent = () => {
    if (isProjectDataLoading) {
      return <Skeleton className="naxatw-h-full naxatw-w-full" />;
    }
    if (!projectData?.per_task_instructions) {
      return <NoDataComponent message={m.instructions_no_data()} />;
    }
    return (
      <p className="naxatw-animate-fade-up naxatw-text-body-md">
        {projectData.per_task_instructions}
      </p>
    );
  };

  return (
    <section className="instructions naxatw-py-5">{renderContent()}</section>
  );
}
