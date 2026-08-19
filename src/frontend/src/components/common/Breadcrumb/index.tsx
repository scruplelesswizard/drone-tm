import React from 'react';
import { useNavigate } from 'react-router-dom';

export interface IBreadCrumbItem {
  name: string;
  navLink: string;
}

interface IBreadCrumbProps {
  data: IBreadCrumbItem[];
}

const BreadCrumb = ({ data }: IBreadCrumbProps) => {
  const navigate = useNavigate();
  return (
    <div className="naxatw-flex naxatw-items-center naxatw-justify-start naxatw-gap-1 naxatw-p-1 naxatw-text-sm naxatw-tracking-[0.0175rem] naxatw-text-[#212121]">
      {data.map((breadCrumbItem, index) => {
        const isNavigable = index < data.length - 1;
        const handleActivate = () => {
          if (isNavigable) navigate(breadCrumbItem.navLink);
        };
        return (
          <React.Fragment key={breadCrumbItem.name}>
            <div
              onClick={handleActivate}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleActivate();
                }
              }}
              tabIndex={0}
              role="button"
              aria-current={isNavigable ? undefined : 'page'}
              className={`${index === data.length - 1 ? 'naxatw-cursor-default naxatw-font-semibold' : 'naxatw-cursor-pointer hover:naxatw-underline'}`}
            >
              {breadCrumbItem?.name}
            </div>
            {isNavigable && <div>/</div>}
          </React.Fragment>
        );
      })}
    </div>
  );
};

export default BreadCrumb;
