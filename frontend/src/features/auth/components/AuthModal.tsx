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
    <Dialog
      open={modal !== null}
      onClose={close}
      className="dark !border-[rgba(255,255,255,0.07)] !bg-[#0F1623] ![box-shadow:0_24px_60px_rgba(0,0,0,0.5),0_0_0_1px_rgba(255,255,255,0.03)]"
    >
      <DialogHeader>
        <DialogTitle className="text-[#F1F5F9]">
          {isLogin ? t('login.title') : t('register.title')}
        </DialogTitle>
        <p className="text-sm text-[#94A3B8]">
          {isLogin ? t('login.subtitle') : t('register.subtitle')}
        </p>
      </DialogHeader>

      {isLogin && <LoginForm onSwitchToRegister={() => open('register')} />}
      {isRegister && <RegisterForm onSwitchToLogin={() => open('login')} />}
    </Dialog>
  );
}
