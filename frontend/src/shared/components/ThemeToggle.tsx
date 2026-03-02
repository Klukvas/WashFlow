import { Moon, Sun, Monitor } from 'lucide-react';
import { useTheme } from '@/shared/hooks/useTheme';
import { Button } from '@/shared/ui/button';

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  const nextTheme = theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light';
  const Icon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Monitor;

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(nextTheme)}
      aria-label={`Switch to ${nextTheme} theme`}
    >
      <Icon className="h-5 w-5" />
    </Button>
  );
}
