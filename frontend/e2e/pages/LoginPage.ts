import { type Page, type Locator } from '@playwright/test';

export class LoginPage {
  readonly tenantIdInput: Locator;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly submitButton: Locator;
  readonly errorMessage: Locator;

  constructor(private readonly page: Page) {
    this.tenantIdInput = page.locator('#tenantId');
    this.emailInput = page.locator('#email');
    this.passwordInput = page.locator('#password');
    this.submitButton = page.locator('[data-testid="login-submit"]');
    this.errorMessage = page.locator('.text-destructive');
  }

  async goto() {
    await this.page.goto('/login');
  }

  async login(tenantId: string, email: string, password: string) {
    await this.tenantIdInput.fill(tenantId);
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.submitButton.click();
  }
}
