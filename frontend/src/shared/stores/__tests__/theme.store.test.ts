import { describe, it, expect, beforeEach } from 'vitest';
import { useThemeStore } from '../theme.store';

describe('theme.store', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('light', 'dark');
    useThemeStore.setState({ theme: 'system' });
  });

  it('defaults to system theme', () => {
    expect(useThemeStore.getState().theme).toBe('system');
  });

  it('setTheme updates store and localStorage', () => {
    useThemeStore.getState().setTheme('dark');

    expect(useThemeStore.getState().theme).toBe('dark');
    expect(localStorage.getItem('theme')).toBe('dark');
  });

  it('setTheme("dark") adds dark class to documentElement', () => {
    useThemeStore.getState().setTheme('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.classList.contains('light')).toBe(false);
  });

  it('setTheme("light") adds light class to documentElement', () => {
    useThemeStore.getState().setTheme('light');
    expect(document.documentElement.classList.contains('light')).toBe(true);
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('setTheme("system") uses matchMedia to determine class', () => {
    useThemeStore.getState().setTheme('system');
    const root = document.documentElement;
    // matchMedia mock returns matches: false, so system -> light
    expect(root.classList.contains('light')).toBe(true);
  });

  it('switching themes removes previous class', () => {
    useThemeStore.getState().setTheme('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);

    useThemeStore.getState().setTheme('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(document.documentElement.classList.contains('light')).toBe(true);
  });
});
