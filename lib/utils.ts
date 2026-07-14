import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge Tailwind class names, resolving conflicts (last wins).
 * Standard shadcn/ui helper — used by the components/ui/* kit.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
