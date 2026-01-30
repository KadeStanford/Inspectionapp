import React from 'react';
import { Grid as MuiGrid, GridProps } from '@mui/material';

interface CustomGridProps extends Omit<GridProps, 'size'> {
  // Legacy props for backward compatibility
  item?: boolean;
  container?: boolean;
  xs?: number | boolean;
  sm?: number | boolean;
  md?: number | boolean;
  lg?: number | boolean;
  xl?: number | boolean;
}

/**
 * Custom Grid wrapper that translates old MUI Grid props to v2 format.
 * - `item` prop is removed (no longer needed in v2)
 * - `xs`, `sm`, `md`, `lg`, `xl` are converted to `size` prop
 */
const Grid: React.FC<CustomGridProps> = ({
  item, // Remove this prop - not needed in Grid v2
  xs,
  sm,
  md,
  lg,
  xl,
  ...rest
}) => {
  // Build the size object from legacy breakpoint props
  const size: { xs?: number | boolean; sm?: number | boolean; md?: number | boolean; lg?: number | boolean; xl?: number | boolean } = {};
  
  if (xs !== undefined) size.xs = xs;
  if (sm !== undefined) size.sm = sm;
  if (md !== undefined) size.md = md;
  if (lg !== undefined) size.lg = lg;
  if (xl !== undefined) size.xl = xl;
  
  // Only pass size prop if we have any breakpoint values
  const hasSize = Object.keys(size).length > 0;
  
  return <MuiGrid {...rest} {...(hasSize ? { size } : {})} />;
};

export default Grid; 