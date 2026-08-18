import TableSection from './TableSection';

interface IContributionsProps {
  isFetching: boolean;

  handleTableRowClick: (rowData: Record<string, unknown>) => void;
}

export default function Contributions({
  isFetching,
  handleTableRowClick,
}: IContributionsProps) {
  return (
    <section className="naxatw-py-5">
      <div className="mt-2">
        <TableSection
          isFetching={isFetching}
          handleTableRowClick={handleTableRowClick}
        />
      </div>
    </section>
  );
}
