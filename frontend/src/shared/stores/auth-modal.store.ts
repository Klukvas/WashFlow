import { create } from 'zustand';

type AuthModalType = 'login' | 'register' | null;

interface AuthModalState {
  modal: AuthModalType;
  open: (modal: 'login' | 'register') => void;
  close: () => void;
}

export const useAuthModalStore = create<AuthModalState>((set) => ({
  modal: null,
  open: (modal) => set({ modal }),
  close: () => set({ modal: null }),
}));
