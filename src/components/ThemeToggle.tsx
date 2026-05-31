import { Moon, Sun } from 'lucide-react';
import type { Theme } from '../lib/useTheme';

type ThemeToggleProps = {
  theme: Theme;
  onToggle: () => void;
};

function ThemeToggle({ theme, onToggle }: ThemeToggleProps) {
  const isDark = theme === 'dark';

  return (
    <button
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-pressed={isDark}
      className="grid place-items-center h-9 w-9 rounded-md bg-white/15 text-white backdrop-blur-sm hover:bg-white/25 transition-colors"
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      type="button"
      onClick={onToggle}
    >
      {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </button>
  );
}

export default ThemeToggle;
