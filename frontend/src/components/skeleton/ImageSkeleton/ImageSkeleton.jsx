import { memo } from 'react';
import { cn } from '../../../utils/cn';
import styles from './ImageSkeleton.module.css';

function ImageSkeleton({ className, ...props }) {
  return (
    <div
      className={cn(styles.skeleton, className)}
      aria-hidden="true"
      {...props}
    />
  );
}

export default memo(ImageSkeleton);
