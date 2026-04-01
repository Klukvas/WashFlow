import { describe, it, expect, beforeEach } from 'vitest';
import { useAuthModalStore } from '../auth-modal.store';

describe('auth-modal.store', () => {
  beforeEach(() => {
    useAuthModalStore.setState({ modal: null });
  });

  it('starts with modal closed (null)', () => {
    const state = useAuthModalStore.getState();
    expect(state.modal).toBeNull();
  });

  it('open("login") sets modal to "login"', () => {
    useAuthModalStore.getState().open('login');
    expect(useAuthModalStore.getState().modal).toBe('login');
  });

  it('open("register") sets modal to "register"', () => {
    useAuthModalStore.getState().open('register');
    expect(useAuthModalStore.getState().modal).toBe('register');
  });

  it('close() sets modal back to null', () => {
    useAuthModalStore.getState().open('login');
    useAuthModalStore.getState().close();
    expect(useAuthModalStore.getState().modal).toBeNull();
  });

  it('switching from login to register replaces modal value', () => {
    useAuthModalStore.getState().open('login');
    expect(useAuthModalStore.getState().modal).toBe('login');

    useAuthModalStore.getState().open('register');
    expect(useAuthModalStore.getState().modal).toBe('register');
  });

  it('closing an already-closed modal stays null', () => {
    useAuthModalStore.getState().close();
    expect(useAuthModalStore.getState().modal).toBeNull();
  });
});
