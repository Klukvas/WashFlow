import { type Page, type Locator } from '@playwright/test';

export class CreateOrderWizardPage {
  readonly modeClientFirst: Locator;
  readonly modeTimeFirst: Locator;
  readonly modeServiceFirst: Locator;
  readonly stepIndicator: Locator;
  readonly nextButton: Locator;
  readonly backButton: Locator;
  readonly changeModeButton: Locator;
  readonly confirmBookingButton: Locator;

  constructor(private readonly page: Page) {
    this.modeClientFirst = page.getByText(/start from client/i);
    this.modeTimeFirst = page.getByText(/start from time/i);
    this.modeServiceFirst = page.getByText(/start from service/i);
    this.stepIndicator = page.locator(
      '[data-testid="step-indicator"] .rounded-full',
    );
    this.nextButton = page.getByRole('button', { name: /next/i });
    this.backButton = page.getByRole('button', { name: /back/i });
    this.changeModeButton = page.getByRole('button', {
      name: /how would you like to start/i,
    });
    this.confirmBookingButton = page.getByRole('button', {
      name: /confirm booking/i,
    });
  }

  async goto() {
    await this.page.goto('/orders/create');
    await this.page.waitForLoadState('networkidle');
  }

  async gotoWithPrefill(params: {
    branchId: string;
    workPostId: string;
    date: string;
    time: string;
  }) {
    const qs = new URLSearchParams(params).toString();
    await this.page.goto(`/orders/create?${qs}`);
    await this.page.waitForLoadState('networkidle');
  }

  async selectMode(mode: 'client-first' | 'time-first' | 'service-first') {
    const locators = {
      'client-first': this.modeClientFirst,
      'time-first': this.modeTimeFirst,
      'service-first': this.modeServiceFirst,
    };
    await locators[mode].click();
  }

  async getStepCount() {
    return this.stepIndicator.count();
  }
}
