import TableSection from './TableSection';

interface ITasksProps {
  isFetching: boolean;

  handleTableRowClick: (rowData: Record<string, unknown>) => void;
}

export default function Tasks({
  isFetching,
  handleTableRowClick,
}: ITasksProps) {
  return (
    <section className="naxatw-py-5">
      <div className="naxatw-mt-2">
        <TableSection
          isFetching={isFetching}
          handleTableRowClick={handleTableRowClick}
        />
      </div>
    </section>
  );
}
