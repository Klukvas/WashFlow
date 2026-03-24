import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Menu, LogOut, KeyRound } from 'lucide-react';
import { useAuthStore } from '@/shared/stores/auth.store';
import { Button } from '@/shared/ui/button';
import { ThemeToggle } from '@/shared/components/ThemeToggle';
import { LanguageSwitcher } from '@/shared/components/LanguageSwitcher';
import { GlobalSearch } from '@/shared/components/GlobalSearch';
import { ChangePasswordDialog } from '@/features/auth/components/ChangePasswordDialog';

interface HeaderProps {
  onMenuClick: () => void;
}

export function Header({ onMenuClick }: HeaderProps) {
  const { t } = useTranslation('auth');
  const { user, logout } = useAuthStore();
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);

  const copyToClipboard = useCallback(async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied`);
    } catch {
      toast.error(`Failed to copy ${label}`);
    }
  }, []);

  return (
    <>
      <header className="flex h-16 items-center justify-between border-b border-border bg-background/85 px-4 backdrop-blur-sm lg:px-6">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={onMenuClick}
          >
            <Menu className="h-5 w-5" />
          </Button>
          <div className="hidden md:block">
            <GlobalSearch />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <LanguageSwitcher />
          <div className="ml-2 flex items-center gap-3 border-l border-border pl-4">
            <div className="hidden text-right text-sm sm:block">
              <p className="font-medium">
                {user?.firstName} {user?.lastName}
              </p>
              <p
                className="cursor-pointer text-xs text-muted-foreground transition-colors hover:text-foreground"
                title="Click to copy email"
                onClick={() =>
                  user?.email && copyToClipboard(user.email, 'Email')
                }
              >
                {user?.email}
              </p>
              {user?.tenantId && (
                <p
                  className="mt-0.5 cursor-pointer font-mono text-xs text-muted-foreground/60 transition-colors hover:text-muted-foreground"
                  title="Click to copy Tenant ID"
                  onClick={() => copyToClipboard(user.tenantId, 'Tenant ID')}
                >
                  {user.tenantId.slice(0, 8)}…
                </p>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setChangePasswordOpen(true)}
              aria-label={t('changePassword.title')}
            >
              <KeyRound className="h-5 w-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={logout}
              aria-label={t('logout')}
            >
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      <ChangePasswordDialog
        open={changePasswordOpen}
        onClose={() => setChangePasswordOpen(false)}
      />
    </>
  );
}
