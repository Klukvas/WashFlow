import { type Page, type Locator } from '@playwright/test';

export class ForgotPasswordPage {
  readonly heading: Locator;
  readonly emailInput: Locator;
  readonly submitButton: Locator;
  readonly successMessage: Locator;
  readonly backToLoginLink: Locator;

  constructor(private readonly page: Page) {
    this.heading = page.getByText(/forgot password/i).first();
    this.emailInput = page.locator('#email');
    this.submitButton = page.getByRole('button', { name: /send reset link/i });
    this.successMessage = page.getByText(/password reset link has been sent/i);
    this.backToLoginLink = page.getByRole('link', { name: /back to sign in/i });
  }

  async goto() {
    await this.page.goto('/forgot-password');
  }
}
