import React, { KeyboardEvent } from 'react';

interface IIconProps extends React.HTMLAttributes<HTMLElement> {
  name: string;
  className?: string;
  iconSymbolType?: string;
  onClick?: () => void;
}

export default function Icon({
  name,
  className,
  iconSymbolType = 'material-symbols-outlined',
  onClick,
  ...rest
}: IIconProps): React.JSX.Element {
  const handleKeyUp = (e: KeyboardEvent<HTMLElement>) => {
    if (!onClick) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick();
    }
  };

  return (
    <i
      role="button"
      tabIndex={0}
      onKeyUp={handleKeyUp}
      onClick={onClick}
      className={`naxatw-text-icon-sm lg:naxatw-text-2xl ${className} ${iconSymbolType}`}
      {...rest}
    >
      {name}
    </i>
  );
}
