import { type Page, type Locator } from '@playwright/test';

export class UsersPage {
  readonly heading: Locator;
  readonly createButton: Locator;
  readonly tableRows: Locator;

  constructor(private readonly page: Page) {
    this.heading = page.getByRole('heading', { name: /users/i });
    this.createButton = page.getByRole('button', { name: /create/i });
    this.tableRows = page.locator('table tbody tr');
  }

  async goto() {
    await this.page.goto('/users');
    await this.page.waitForLoadState('networkidle');
  }

  async getRowCount() {
    return this.tableRows.count();
  }

  async openCreateDialog() {
    await this.createButton.click();
    await this.page.waitForSelector('[role="dialog"]');
  }

  async fillUserForm(data: {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    phone?: string;
  }) {
    await this.page.locator('#firstName').fill(data.firstName);
    await this.page.locator('#lastName').fill(data.lastName);
    await this.page.locator('#email').fill(data.email);
    await this.page.locator('#password').fill(data.password);
    if (data.phone) {
      await this.page.locator('#phone').fill(data.phone);
    }
  }
}
