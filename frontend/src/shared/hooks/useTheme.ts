import { useThemeStore } from '@/shared/stores/theme.store';

export function useTheme() {
  return useThemeStore();
}
