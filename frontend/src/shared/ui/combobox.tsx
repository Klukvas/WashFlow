import { useState, useRef, useEffect, useCallback } from 'react';
import { Search } from 'lucide-react';
import { cn } from '@/shared/utils/cn';

export interface ComboboxOption {
  value: string;
  label: string;
  sublabel?: string;
}

export interface ComboboxProps {
  options: ComboboxOption[];
  value?: string;
  onChange: (value: string) => void;
  onSearch?: (query: string) => void;
  placeholder?: string;
  error?: string;
  disabled?: boolean;
  loading?: boolean;
}

export function Combobox({
  options,
  value,
  onChange,
  onSearch,
  placeholder = 'Search...',
  error,
  disabled,
  loading,
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setQuery(val);
      onSearch?.(val);
      if (!open) setOpen(true);
    },
    [onSearch, open],
  );

  const handleSelect = useCallback(
    (optionValue: string) => {
      onChange(optionValue);
      setQuery('');
      setOpen(false);
    },
    [onChange],
  );

  const handleFocus = useCallback(() => {
    setOpen(true);
    onSearch?.(query);
  }, [onSearch, query]);

  const displayValue = open ? query : selected?.label ?? '';

  return (
    <div className="relative w-full" ref={containerRef}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          ref={inputRef}
          type="text"
          className={cn(
            'flex h-10 w-full rounded-md border border-input bg-background pl-9 pr-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
            error && 'border-destructive focus-visible:ring-destructive',
          )}
          placeholder={placeholder}
          value={displayValue}
          onChange={handleInputChange}
          onFocus={handleFocus}
          disabled={disabled}
          autoComplete="off"
        />
      </div>

      {open && (
        <div className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border bg-popover shadow-md">
          {loading && (
            <div className="px-3 py-2 text-sm text-muted-foreground">Loading...</div>
          )}
          {!loading && options.length === 0 && (
            <div className="px-3 py-2 text-sm text-muted-foreground">No results</div>
          )}
          {!loading &&
            options.map((option) => (
              <button
                key={option.value}
                type="button"
                className={cn(
                  'flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-accent',
                  option.value === value && 'bg-accent',
                )}
                onClick={() => handleSelect(option.value)}
              >
                <span className="font-medium">{option.label}</span>
                {option.sublabel && (
                  <span className="text-xs text-muted-foreground">{option.sublabel}</span>
                )}
              </button>
            ))}
        </div>
      )}

      {error && <p className="mt-1 text-sm text-destructive">{error}</p>}
    </div>
  );
}
