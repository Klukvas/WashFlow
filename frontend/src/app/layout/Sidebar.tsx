import { NavLink } from 'react-router';
import { useTranslation } from 'react-i18next';
import {
  LayoutDashboard,
  ShoppingCart,
  Users,
  Car,
  Wrench,
  Building2,
  Columns3,
  UserCog,
  Shield,
  BarChart3,
  FileText,
  HardHat,
  CreditCard,
  BookOpen,
  X,
} from 'lucide-react';
import { usePermissions } from '@/shared/hooks/usePermissions';
import { PERMISSIONS } from '@/shared/constants/permissions';
import { cn } from '@/shared/utils/cn';
import { Button } from '@/shared/ui/button';
import washflowIcon from '@/shared/assets/washflow-icon.svg';

interface SidebarProps {
  collapsed: boolean;
  mobile: boolean;
  onClose?: () => void;
}

interface NavItem {
  to: string;
  icon: React.ElementType;
  labelKey: string;
  permission?: string;
}

const mainItems: NavItem[] = [
  { to: '/dashboard', icon: LayoutDashboard, labelKey: 'dashboard' },
  {
    to: '/orders',
    icon: ShoppingCart,
    labelKey: 'orders',
    permission: PERMISSIONS.ORDERS.READ,
  },
  {
    to: '/clients',
    icon: Users,
    labelKey: 'clients',
    permission: PERMISSIONS.CLIENTS.READ,
  },
  {
    to: '/vehicles',
    icon: Car,
    labelKey: 'vehicles',
    permission: PERMISSIONS.VEHICLES.READ,
  },
  {
    to: '/services',
    icon: Wrench,
    labelKey: 'services',
    permission: PERMISSIONS.SERVICES.READ,
  },
];

const managementItems: NavItem[] = [
  {
    to: '/branches',
    icon: Building2,
    labelKey: 'branches',
    permission: PERMISSIONS.BRANCHES.READ,
  },
  {
    to: '/work-posts',
    icon: Columns3,
    labelKey: 'workPosts',
    permission: PERMISSIONS.WORK_POSTS.READ,
  },
  {
    to: '/users',
    icon: UserCog,
    labelKey: 'users',
    permission: PERMISSIONS.USERS.READ,
  },
  {
    to: '/roles',
    icon: Shield,
    labelKey: 'roles',
    permission: PERMISSIONS.ROLES.READ,
  },
  {
    to: '/workforce',
    icon: HardHat,
    labelKey: 'workforce',
    permission: PERMISSIONS.WORKFORCE.READ,
  },
  {
    to: '/subscription',
    icon: CreditCard,
    labelKey: 'subscription',
    permission: PERMISSIONS.TENANTS.READ,
  },
];

const systemItems: NavItem[] = [
  {
    to: '/analytics',
    icon: BarChart3,
    labelKey: 'analytics',
    permission: PERMISSIONS.ANALYTICS.VIEW,
  },
  {
    to: '/audit',
    icon: FileText,
    labelKey: 'audit',
    permission: PERMISSIONS.AUDIT.READ,
  },
];

const helpItems: NavItem[] = [
  { to: '/how-to', icon: BookOpen, labelKey: 'howTo' },
];

function NavSection({
  title,
  items,
  collapsed,
}: {
  title: string;
  items: NavItem[];
  collapsed: boolean;
}) {
  const { t } = useTranslation('nav');
  const { hasPermission } = usePermissions();

  const filteredItems = items.filter(
    (item) => !item.permission || hasPermission(item.permission),
  );

  if (filteredItems.length === 0) return null;

  return (
    <div className="mb-4">
      {!collapsed && (
        <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </p>
      )}
      <nav className="flex flex-col gap-1">
        {filteredItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/dashboard'}
            aria-label={collapsed ? t(item.labelKey) : undefined}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary/10 text-primary'
                  : 'text-sidebar-foreground hover:bg-accent',
                collapsed && 'justify-center px-2',
              )
            }
          >
            <item.icon className="h-5 w-5 shrink-0" aria-hidden="true" />
            {!collapsed && <span>{t(item.labelKey)}</span>}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

export function Sidebar({ collapsed, mobile, onClose }: SidebarProps) {
  const { t } = useTranslation('nav');

  return (
    <aside
      className={cn(
        'flex h-full flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-200 ease-in-out',
        collapsed ? 'w-16' : 'w-64',
        mobile && 'fixed inset-y-0 left-0 z-40 shadow-lg',
      )}
    >
      <div className="flex h-16 items-center justify-between border-b border-sidebar-border px-4">
        <div className="flex items-center gap-2.5">
          <img
            src={washflowIcon}
            alt="WashFlow"
            className="h-8 w-8 shrink-0 rounded-lg"
          />
          {!collapsed && (
            <div className="flex flex-col">
              <span className="text-lg font-bold leading-tight text-primary">
                WashFlow
              </span>
              <span className="text-[10px] leading-tight text-muted-foreground">
                Powered by FluxLab
              </span>
            </div>
          )}
        </div>
        {mobile && onClose && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label={t('closeSidebar')}
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-4">
        <NavSection
          title={t('sections.main')}
          items={mainItems}
          collapsed={collapsed}
        />
        <NavSection
          title={t('sections.management')}
          items={managementItems}
          collapsed={collapsed}
        />
        <NavSection
          title={t('sections.system')}
          items={systemItems}
          collapsed={collapsed}
        />
        <NavSection
          title={t('sections.help')}
          items={helpItems}
          collapsed={collapsed}
        />
      </div>
    </aside>
  );
}
