import { cn } from '@Utils/index';
import { IFlexContainerProps } from '../types';

export default function Flex({
  className = '',
  children,
  gap,
  md,
  // row is part of the public prop contract but not yet wired to actual
  // layout direction - see todo.md.
  row: _row,
  ...rest
}: IFlexContainerProps) {
  let newClassNames = '';
  if (md) newClassNames += `md:naxatw-flex-row `;

  return (
    <div
      className={cn(
        `naxatw-flex naxatw-flex-col ${newClassNames} ${className}`,
      )}
      {...rest}
      style={{
        gap: gap ? `${gap * 0.25}rem` : '',
      }}
    >
      {children}
    </div>
  );
}
