import { useState } from 'react';
import { useTranslation } from 'react-i18next';
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

  return (
    <>
      <header className="flex h-16 items-center justify-between border-b border-border bg-background px-4 lg:px-6">
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
              <p className="font-medium">{user?.firstName} {user?.lastName}</p>
              <p className="text-xs text-muted-foreground">{user?.email}</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setChangePasswordOpen(true)}
              aria-label={t('changePassword.title')}
            >
              <KeyRound className="h-5 w-5" />
            </Button>
            <Button variant="ghost" size="icon" onClick={logout} aria-label={t('logout')}>
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
