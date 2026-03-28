import { useTranslation } from 'react-i18next';
import { Dialog, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { useAuthModalStore } from '@/shared/stores/auth-modal.store';
import { LoginForm } from './LoginForm';
import { RegisterForm } from './RegisterForm';

export function AuthModal() {
  const { t } = useTranslation('auth');
  const { modal, open, close } = useAuthModalStore();

  const isLogin = modal === 'login';
  const isRegister = modal === 'register';

  return (
    <Dialog open={modal !== null} onClose={close} className="dark">
      <DialogHeader>
        <DialogTitle>
          {isLogin ? t('login.title') : t('register.title')}
        </DialogTitle>
        <p className="text-sm text-muted-foreground">
          {isLogin ? t('login.subtitle') : t('register.subtitle')}
        </p>
      </DialogHeader>

      {isLogin && <LoginForm onSwitchToRegister={() => open('register')} />}
      {isRegister && <RegisterForm onSwitchToLogin={() => open('login')} />}
    </Dialog>
  );
}
