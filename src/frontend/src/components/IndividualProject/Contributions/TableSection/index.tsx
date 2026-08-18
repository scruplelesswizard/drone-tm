import DataTable, { ColumnData } from '@Components/common/DataTable';
import Icon from '@Components/common/Icon';
import { RasterSourceSpecification } from 'maplibre-gl';
import { CellContext } from '@tanstack/react-table';
import { setProjectState } from '@Store/actions/project';
import { useTypedSelector } from '@Store/hooks';
import { formatString, buildDownloadUrl } from '@Utils/index';
import { useMemo } from 'react';
import { useDispatch } from 'react-redux';
import { toast } from 'react-toastify';
import { m } from '@/paraglide/messages';

const contributionsDataColumns = [
  {
    header: m.contributions_table_user(),
    accessorKey: 'user',
  },
  {
    header: m.contributions_table_task_mapped(),
    accessorKey: 'task_mapped',
  },
  {
    header: m.contributions_table_task_status(),
    accessorKey: 'task_state',
  },
  { header: m.contributions_table_image_count(), accessorKey: 'image_count' },

  {
    header: m.contributions_table_orthophoto(),
    accessorKey: 'assets_url',
    cell: function CellComponent({
      row,
    }: CellContext<ColumnData, unknown>) {
      const { original: rowDataRaw } = row;
      const rowData = rowDataRaw as unknown as {
        assets_url?: string;
        task_id?: string;
        // orthophoto_url isn't set by the taskDataForTable reduce below -
        // not part of this row's shape, kept as a defensive fallback
        // (always undefined before this was typed, same as now).
        orthophoto_url?: string;
      };
      const dispatch = useDispatch();
      const visibleOrthophotoList = useTypedSelector(
        state => state.project.visibleOrthophotoList,
      );

      const handleDownloadResult = () => {
        if (!rowData?.assets_url) return;
        try {
          const link = document.createElement('a');
          link.href = buildDownloadUrl(rowData.assets_url);
          link.setAttribute('download', '');
          document.body.appendChild(link);
          link.click();
          link.remove();
        } catch (error) {
          toast.error(
            m.individual_project_download_error({ error: String(error) }),
          );
        }
      };

      const handleDownloadOrtho = () => {
        if (!rowData?.assets_url) return;
        try {
          const orthoUrl = rowData.assets_url.replace(/\/$/, '/orthophoto/');
          const link = document.createElement('a');
          link.href = buildDownloadUrl(orthoUrl);
          link.setAttribute('download', '');
          document.body.appendChild(link);
          link.click();
          link.remove();
        } catch (error) {
          toast.error(
            m.individual_project_download_error({ error: String(error) }),
          );
        }
      };

      const currentOrthophoto = visibleOrthophotoList?.find(
        orthophoto => orthophoto?.taskId === rowData.task_id,
      );

      const handleViewResult = () => {
        if (!rowData?.orthophoto_url) return;
        let newVisibleList: {
          taskId: string;
          source: RasterSourceSpecification;
        }[] = [];
        if (currentOrthophoto) {
          newVisibleList = visibleOrthophotoList.filter(
            orthophoto => orthophoto?.taskId !== rowData?.task_id,
          );
        } else {
          newVisibleList = [
            ...visibleOrthophotoList,
            {
              taskId: rowData.task_id as string,
              source: {
                type: 'raster',
                url: `cog://${rowData?.orthophoto_url}`,
                tileSize: 256,
              },
            },
          ];
        }
        dispatch(setProjectState({ visibleOrthophotoList: newVisibleList }));
      };

      return (
        <div className="naxatw-flex naxatw-gap-3">
          <div>
            <div
              className="naxatw-group naxatw-flex naxatw-cursor-pointer naxatw-items-center naxatw-gap-1 naxatw-text-center naxatw-font-semibold naxatw-text-red"
              tabIndex={0}
              role="button"
              onKeyDown={() => {}}
              onClick={e => {
                e.stopPropagation();
                handleViewResult();
              }}
            >
              <Icon
                className="!naxatw-text-icon-sm"
                name={currentOrthophoto ? 'visibility' : 'visibility_off'}
              />
            </div>
          </div>
          <div
            className="naxatw-group naxatw-flex naxatw-cursor-pointer naxatw-items-center naxatw-gap-1 naxatw-text-center naxatw-text-xs naxatw-font-semibold naxatw-text-blue-600"
            title={m.contributions_table_download_orthophoto_only()}
            tabIndex={0}
            role="button"
            onKeyDown={() => {}}
            onClick={e => {
              e.stopPropagation();
              handleDownloadOrtho();
            }}
          >
            <Icon className="!naxatw-text-icon-sm" name="download" />
          </div>
          <div
            className="naxatw-group naxatw-flex naxatw-cursor-pointer naxatw-items-center naxatw-gap-1 naxatw-text-center naxatw-text-xs naxatw-font-semibold naxatw-text-gray-500"
            title={m.contributions_table_download_all_odm_assets()}
            tabIndex={0}
            role="button"
            onKeyDown={() => {}}
            onClick={e => {
              e.stopPropagation();
              handleDownloadResult();
            }}
          >
            <Icon className="!naxatw-text-icon-sm" name="folder_zip" />
          </div>
        </div>
      );
    },
  },
];

interface ITableSectionProps {
  isFetching: boolean;

  handleTableRowClick: (rowData: Record<string, unknown>) => void;
}

export default function TableSection({
  isFetching,
  handleTableRowClick,
}: ITableSectionProps) {
  const tasksData = useTypedSelector(state => state.project.tasksData);

  const taskDataForTable = useMemo(() => {
    if (!tasksData) return [];
    return tasksData?.reduce<Record<string, unknown>[]>((acc, curr) => {
      if (!curr?.state || curr?.state === 'UNLOCKED') return acc;

      return [
        ...acc,
        {
          user: curr?.name || '-',
          task_mapped: `Task# ${curr?.project_task_index}`,
          task_state: formatString(curr?.state),
          assets_url: curr?.assets_url,
          image_count: curr?.total_image_uploaded,
          task_id: curr?.id,
          outline: curr?.outline,
        },
      ];
    }, []);
  }, [tasksData]);

  return (
    <DataTable
      columns={contributionsDataColumns}
      wrapperStyle={{
        height: '100%',
      }}
      data={taskDataForTable}
      withPagination={false}
      loading={isFetching}
      tableOptions={{ manualSorting: false }}
      handleTableRowClick={handleTableRowClick}
    />
  );
}
