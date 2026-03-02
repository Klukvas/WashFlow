import { useState, useRef, useEffect, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Search, X, User, ShoppingCart, Wrench } from 'lucide-react';
import { useDebounce } from '@/shared/hooks/useDebounce';
import { apiClient } from '@/shared/api/client';
import type { Client, Order, Service } from '@/shared/types/models';
import type { PaginatedApiResponse } from '@/shared/types/api';

type ResultType = 'client' | 'order' | 'service';

interface SearchResult {
  type: ResultType;
  id: string;
  title: string;
  subtitle: string;
}

const TYPE_ICONS: Record<ResultType, typeof User> = {
  client: User,
  order: ShoppingCart,
  service: Wrench,
};

const TYPE_ROUTES: Record<ResultType, string> = {
  client: '/clients',
  order: '/orders',
  service: '/services',
};

export function GlobalSearch() {
  const { t } = useTranslation('common');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const debouncedQuery = useDebounce(query, 300);

  useEffect(() => {
    function handleShortcut(e: globalThis.KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    }
    document.addEventListener('keydown', handleShortcut);
    return () => document.removeEventListener('keydown', handleShortcut);
  }, []);

  useEffect(() => {
    if (!debouncedQuery || debouncedQuery.length < 2) {
      setResults([]);
      return;
    }

    const controller = new AbortController();
    const signal = controller.signal;

    async function search() {
      try {
        const [clientsResp, ordersResp, servicesResp] =
          await Promise.allSettled([
            apiClient.get<PaginatedApiResponse<Client>>('/clients', {
              params: { search: debouncedQuery, limit: 5 },
              signal,
            }),
            apiClient.get<PaginatedApiResponse<Order>>('/orders', {
              params: { limit: 5, sortBy: 'createdAt', sortOrder: 'desc' },
              signal,
            }),
            apiClient.get<PaginatedApiResponse<Service>>('/services', {
              params: { limit: 10 },
              signal,
            }),
          ]);

        const mapped: SearchResult[] = [];

        if (clientsResp.status === 'fulfilled') {
          for (const c of clientsResp.value.data.data) {
            mapped.push({
              type: 'client',
              id: c.id,
              title: `${c.firstName} ${c.lastName ?? ''}`.trim(),
              subtitle: c.phone ?? c.email ?? '',
            });
          }
        }

        if (ordersResp.status === 'fulfilled') {
          const q = debouncedQuery.toLowerCase();
          const filtered = ordersResp.value.data.data.filter((o) => {
            const clientName = o.client
              ? `${o.client.firstName} ${o.client.lastName ?? ''}`.toLowerCase()
              : '';
            const plate = o.vehicle?.licensePlate?.toLowerCase() ?? '';
            const idShort = o.id.slice(0, 8).toLowerCase();
            return (
              clientName.includes(q) ||
              plate.includes(q) ||
              idShort.includes(q) ||
              o.status.toLowerCase().includes(q)
            );
          });
          for (const o of filtered.slice(0, 3)) {
            const clientName = o.client
              ? `${o.client.firstName} ${o.client.lastName ?? ''}`.trim()
              : '';
            mapped.push({
              type: 'order',
              id: o.id,
              title: `#${o.id.slice(0, 8)} — ${clientName}`,
              subtitle: `${o.status} · ${o.vehicle?.licensePlate ?? ''}`,
            });
          }
        }

        if (servicesResp.status === 'fulfilled') {
          const q = debouncedQuery.toLowerCase();
          const filtered = servicesResp.value.data.data.filter(
            (s) =>
              s.name.toLowerCase().includes(q) ||
              (s.description?.toLowerCase().includes(q) ?? false),
          );
          for (const s of filtered.slice(0, 3)) {
            mapped.push({
              type: 'service',
              id: s.id,
              title: s.name,
              subtitle: `${s.durationMin} min · ${s.price}`,
            });
          }
        }

        setResults(mapped);
        setActiveIndex(-1);
      } catch {
        // Ignore aborted requests
      }
    }

    search();
    return () => controller.abort();
  }, [debouncedQuery]);

  function handleSelect(result: SearchResult) {
    setOpen(false);
    setQuery('');
    if (result.type === 'service') {
      navigate(TYPE_ROUTES[result.type]);
    } else {
      navigate(`${TYPE_ROUTES[result.type]}/${result.id}`);
    }
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault();
      handleSelect(results[activeIndex]);
    } else if (e.key === 'Escape') {
      setOpen(false);
      setQuery('');
    }
  }

  return (
    <div className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 200)}
          onKeyDown={handleKeyDown}
          placeholder={t('search.placeholder')}
          className="h-9 w-64 rounded-md border border-input bg-background pl-9 pr-8 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        {query && (
          <button
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            onClick={() => {
              setQuery('');
              setResults([]);
            }}
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {open && results.length > 0 && (
        <div className="absolute top-full z-50 mt-1 w-full min-w-80 rounded-md border border-border bg-popover shadow-lg">
          {results.map((result, idx) => {
            const Icon = TYPE_ICONS[result.type];
            return (
              <button
                key={`${result.type}-${result.id}`}
                className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-accent ${idx === activeIndex ? 'bg-accent' : ''}`}
                onMouseDown={() => handleSelect(result)}
              >
                <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{result.title}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {result.subtitle}
                  </div>
                </div>
                <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
                  {t(`search.${result.type}s`)}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
