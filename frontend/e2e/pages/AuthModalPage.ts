import { type Page, type Locator } from '@playwright/test';

export class AuthModalPage {
  readonly dialog: Locator;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly confirmPasswordInput: Locator;
  readonly loginSubmit: Locator;
  readonly registerSubmit: Locator;
  readonly errorMessage: Locator;
  readonly switchToRegisterLink: Locator;
  readonly switchToLoginLink: Locator;
  readonly forgotPasswordLink: Locator;

  constructor(private readonly page: Page) {
    this.dialog = page.locator('[role="dialog"]');
    this.emailInput = page.locator('#email');
    this.passwordInput = page.locator('#password');
    this.confirmPasswordInput = page.locator('#confirmPassword');
    this.loginSubmit = page.locator('[data-testid="login-submit"]');
    this.registerSubmit = page.locator('[data-testid="register-submit"]');
    this.errorMessage = page.locator('.text-destructive');
    this.switchToRegisterLink = page.getByRole('button', {
      name: /register/i,
    });
    this.switchToLoginLink = page
      .locator('[role="dialog"]')
      .getByRole('button', { name: /sign in/i });
    this.forgotPasswordLink = page.getByRole('link', {
      name: /forgot password/i,
    });
  }

  async fillLogin(email: string, password: string) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
  }

  async fillRegister(email: string, password: string, confirmPassword: string) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.confirmPasswordInput.fill(confirmPassword);
  }

  async submitLogin() {
    await this.loginSubmit.click();
  }

  async submitRegister() {
    await this.registerSubmit.click();
  }
}
