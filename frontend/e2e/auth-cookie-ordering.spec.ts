import { test, expect, type Page, type Route } from '@playwright/test';

const userA = {
  id: 'synthetic-a',
  email: 'a@example.test',
  firstName: 'A',
  lastName: 'Test',
  tenantId: 'synthetic-tenant-a',
  branchId: null,
  isSuperAdmin: false,
};
const userB = { ...userA, id: 'synthetic-b', tenantId: 'synthetic-tenant-b' };
const userC = { ...userA, id: 'synthetic-c', tenantId: 'synthetic-tenant-c' };
function tokenFor(owner: string) {
  return `header.${Buffer.from(JSON.stringify({ sub: `synthetic-${owner}`, permissions: ['orders.read'] })).toString('base64')}.signature`;
}
const token = tokenFor('a');

function gate() {
  let release = () => {};
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release: () => release() };
}

type Harness = {
  auth: typeof import('../src/shared/stores/auth.store');
  client: typeof import('../src/shared/api/client');
  service: typeof import('../src/features/auth/api/auth.api');
  orders?: Promise<unknown>;
  attempt?: Promise<unknown>;
  nextAttempt?: Promise<unknown>;
  logout?: Promise<void>;
  boot?: Promise<void>;
};
declare global {
  interface Window {
    cookieTest: Harness;
  }
}

async function openHarness(
  page: Page,
  handle: (route: Route, path: string) => Promise<void>,
) {
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== 'http://127.0.0.1:5179') return route.abort();
    if (url.pathname.startsWith('/api/')) return handle(route, url.pathname);
    if (url.pathname === '/')
      return route.fulfill({
        contentType: 'text/html',
        body: `<html><body><script type="module">
        import RefreshRuntime from '/@react-refresh';
        RefreshRuntime.injectIntoGlobalHook(window);
        window.$RefreshReg$ = () => {};
        window.$RefreshSig$ = () => type => type;
        window.__vite_plugin_react_preamble_installed__ = true;
        // Follow Vite's exact URLs (including HMR timestamps) so the harness
        // observes the same store singleton as the actual service and client.
        const servicePath = '/src/features/auth/api/auth.api.ts';
        const serviceSource = await fetch(servicePath).then(r => r.text());
        const clientPath = serviceSource.match(/from ["']([^"']*client[.]ts[^"']*)["']/)[1];
        const clientSource = await fetch(clientPath).then(r => r.text());
        const authPath = clientSource.match(/from ["']([^"']*auth[.]store[.]ts[^"']*)["']/)[1];
        const [auth, client, service] = await Promise.all([
          import(authPath), import(clientPath), import(servicePath),
        ]);
        window.cookieTest = { auth, client, service };
      </script></body></html>`,
      });
    return route.continue();
  });
  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.cookieTest));
}

async function respondAuth(route: Route, owner: 'a' | 'b' | 'c') {
  await route.fulfill({
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': `refresh_token=${owner}; Path=/api/v1/auth; HttpOnly; SameSite=Strict`,
    },
    body: JSON.stringify({
      data: {
        accessToken: tokenFor(owner),
        user: owner === 'a' ? userA : owner === 'b' ? userB : userC,
      },
    }),
  });
}

async function startAttempt(
  page: Page,
  method: 'login' | 'register' = 'login',
  next = false,
) {
  await page.evaluate(
    ({ method, next }) => {
      const h = window.cookieTest;
      const result = h.service[method]({
        email: next ? 'c@example.test' : 'b@example.test',
        password: 'synthetic',
      }).then(
        (result) => {
          h.auth.useAuthStore
            .getState()
            .setAuth(result.accessToken, result.user);
          return 'success';
        },
        (error: { code?: string }) => error.code,
      );
      if (next) h.nextAttempt = result;
      else h.attempt = result;
    },
    { method, next },
  );
}

async function expectCookie(page: Page, owner: string | null) {
  const cookie = (await page.context().cookies()).find(
    (cookie) => cookie.name === 'refresh_token',
  );
  if (owner === null) expect(cookie).toBeUndefined();
  else
    expect(cookie).toMatchObject({
      value: owner,
      httpOnly: true,
      path: '/api/v1/auth',
    });
  expect(await page.evaluate(() => document.cookie)).not.toContain(
    'refresh_token',
  );
}

for (const method of ['login', 'register'] as const) {
  test(`late old 401 during ${method} cannot overwrite B's HttpOnly cookie`, async ({
    page,
    context,
  }) => {
    const orders = gate();
    const login = gate();
    const refresh = gate();
    const sent: string[] = [];
    await openHarness(page, async (route, path) => {
      sent.push(path);
      if (path === '/api/v1/orders') {
        await orders.promise;
        return route.fulfill({
          status: 401,
          json: { message: 'Synthetic expired A' },
        });
      }
      if (path === `/api/v1/auth/${method}`) {
        await login.promise;
        return respondAuth(route, 'b');
      }
      if (path === '/api/v1/auth/refresh') {
        await refresh.promise;
        return respondAuth(route, 'a');
      }
      throw new Error(`Unexpected API request: ${path}`);
    });
    await page.evaluate(
      ({ token, userA }) => {
        const h = window.cookieTest;
        h.auth.useAuthStore.getState().setAuth(token, userA);
        h.orders = h.client.apiClient.get('/orders').then(
          () => 'success',
          (error: { code?: string }) => error.code,
        );
      },
      { token, userA },
    );
    await expect.poll(() => sent).toContain('/api/v1/orders');
    await startAttempt(page, method);
    await expect.poll(() => sent).toContain(`/api/v1/auth/${method}`);
    orders.release();
    // A subsequent request completes after the old 401 handler has had a chance to run.
    await page.waitForResponse((response) =>
      response.url().endsWith('/api/v1/orders'),
    );
    login.release();
    expect(await page.evaluate(() => window.cookieTest.attempt)).toBe(
      'success',
    );
    refresh.release();
    expect(await page.evaluate(() => window.cookieTest.orders)).toBe(
      'ERR_CANCELED',
    );
    const cookies = await context.cookies();
    expect(
      cookies.find((cookie) => cookie.name === 'refresh_token'),
    ).toMatchObject({ value: 'b', httpOnly: true, path: '/api/v1/auth' });
    expect(await page.evaluate(() => document.cookie)).not.toContain(
      'refresh_token',
    );
    expect(
      await page.evaluate(
        () => window.cookieTest.auth.useAuthStore.getState().user?.id,
      ),
    ).toBe(userB.id);
    expect(sent.filter((path) => path.endsWith('/auth/refresh'))).toEqual([]);
  });
}

for (const kind of ['boot', 'refresh', 'logout'] as const) {
  test(`login follows the old ${kind} HTTP cookie response`, async ({
    page,
  }) => {
    const oldResponse = gate();
    const sent: string[] = [];
    await openHarness(page, async (route, path) => {
      sent.push(path);
      if (path.endsWith('/orders'))
        return route.fulfill({ status: 401, json: {} });
      if (path.endsWith('/auth/login')) return respondAuth(route, 'b');
      if (path.endsWith('/auth/refresh') || path.endsWith('/auth/logout')) {
        await oldResponse.promise;
        if (path.endsWith('/auth/refresh')) return respondAuth(route, 'a');
        return route.fulfill({
          status: 204,
          headers: {
            'Set-Cookie':
              'refresh_token=; Path=/api/v1/auth; HttpOnly; Max-Age=0',
          },
        });
      }
      throw new Error(`Unexpected API request: ${path}`);
    });
    await page.evaluate(
      ({ kind, token, userA }) => {
        const h = window.cookieTest;
        if (kind === 'boot') {
          h.auth.useAuthStore.setState({ user: userA, isAuthenticated: true });
          h.boot = h.auth.useAuthStore.getState().bootRefresh();
        } else {
          h.auth.useAuthStore.getState().setAuth(token, userA);
          if (kind === 'logout')
            h.logout = h.auth.useAuthStore.getState().logout();
          else
            h.orders = h.client.apiClient
              .get('/orders')
              .catch((error: { code?: string }) => error.code);
        }
      },
      { kind, token, userA },
    );
    await expect
      .poll(() => sent)
      .toContain(`/api/v1/auth/${kind === 'logout' ? 'logout' : 'refresh'}`);
    await startAttempt(page);
    await page.waitForFunction(() =>
      window.cookieTest.auth.isAuthTransitionPending(),
    );
    expect(sent).not.toContain('/api/v1/auth/login');
    oldResponse.release();
    expect(await page.evaluate(() => window.cookieTest.attempt)).toBe(
      'success',
    );
    await page.evaluate(async () => {
      const h = window.cookieTest;
      await Promise.all([h.orders, h.boot, h.logout]);
    });
    await expectCookie(page, 'b');
    expect(
      await page.evaluate(
        () => window.cookieTest.auth.useAuthStore.getState().user?.id,
      ),
    ).toBe(userB.id);
    expect(sent.at(-1)).toBe('/api/v1/auth/login');
  });
}

for (const method of ['login', 'register'] as const) {
  test(`logout during ${method} follows its response and clears B's HttpOnly cookie`, async ({
    page,
  }) => {
    const response = gate();
    const sent: string[] = [];
    await openHarness(page, async (route, path) => {
      sent.push(path);
      if (path.endsWith(`/auth/${method}`)) {
        await response.promise;
        return respondAuth(route, 'b');
      }
      if (path.endsWith('/auth/logout')) {
        expect(route.request().headers().authorization).toBe(
          `Bearer ${tokenFor('b')}`,
        );
        return route.fulfill({
          status: 204,
          headers: {
            'Set-Cookie':
              'refresh_token=; Path=/api/v1/auth; HttpOnly; Max-Age=0',
          },
        });
      }
      throw new Error(`Unexpected API request: ${path}`);
    });
    await startAttempt(page, method);
    await expect.poll(() => sent).toContain(`/api/v1/auth/${method}`);
    await page.evaluate(() => {
      window.cookieTest.logout = window.cookieTest.auth.useAuthStore
        .getState()
        .logout();
    });
    expect(sent).not.toContain('/api/v1/auth/logout');
    response.release();
    expect(await page.evaluate(() => window.cookieTest.attempt)).toBe(
      'ERR_CANCELED',
    );
    await page.evaluate(() => window.cookieTest.logout);
    await expectCookie(page, null);
    expect(
      await page.evaluate(
        () => window.cookieTest.auth.useAuthStore.getState().user,
      ),
    ).toBeNull();
    expect(sent).toEqual([`/api/v1/auth/${method}`, '/api/v1/auth/logout']);
  });

  test(`parallel ${method} and successor auth accept only the last cookie owner`, async ({
    page,
  }) => {
    const first = gate();
    const sent: string[] = [];
    await openHarness(page, async (route, path) => {
      sent.push(path);
      if (!path.endsWith('/auth/login') && !path.endsWith('/auth/register'))
        throw new Error(`Unexpected API request: ${path}`);
      if (route.request().postDataJSON().email === 'b@example.test') {
        await first.promise;
        return respondAuth(route, 'b');
      }
      return respondAuth(route, 'c');
    });
    await startAttempt(page, method);
    await expect.poll(() => sent).toHaveLength(1);
    await startAttempt(page, method === 'login' ? 'register' : 'login', true);
    expect(sent).toHaveLength(1);
    first.release();
    expect(await page.evaluate(() => window.cookieTest.attempt)).toBe(
      'ERR_CANCELED',
    );
    expect(await page.evaluate(() => window.cookieTest.nextAttempt)).toBe(
      'success',
    );
    await expectCookie(page, 'c');
    expect(
      await page.evaluate(
        () => window.cookieTest.auth.useAuthStore.getState().user?.id,
      ),
    ).toBe(userC.id);
    expect(sent).toHaveLength(2);
  });
}

test('login failure clears the old cookie and a subsequent login can proceed', async ({
  page,
}) => {
  let attempts = 0;
  const sent: string[] = [];
  await openHarness(page, async (route, path) => {
    sent.push(path);
    if (path.endsWith('/auth/login')) {
      if (++attempts === 1)
        return route.fulfill({
          status: 401,
          json: { message: 'Synthetic invalid credentials' },
        });
      return respondAuth(route, 'b');
    }
    if (path.endsWith('/auth/logout')) {
      expect(route.request().headers().authorization).toBe(`Bearer ${token}`);
      return route.fulfill({
        status: 204,
        headers: {
          'Set-Cookie':
            'refresh_token=; Path=/api/v1/auth; HttpOnly; Max-Age=0',
        },
      });
    }
    throw new Error(`Unexpected API request: ${path}`);
  });
  // Seed via an HTTP response rather than document.cookie/context.addCookies.
  await page.route('**/api/v1/auth/seed', (route) => respondAuth(route, 'a'));
  await page.evaluate(
    async ({ token, userA }) => {
      await fetch('/api/v1/auth/seed');
      window.cookieTest.auth.useAuthStore.getState().setAuth(token, userA);
    },
    { token, userA },
  );
  await expectCookie(page, 'a');
  await startAttempt(page);
  expect(await page.evaluate(() => window.cookieTest.attempt)).toBe(
    'ERR_BAD_REQUEST',
  );
  await expectCookie(page, null);
  expect(
    await page.evaluate(
      () => window.cookieTest.auth.useAuthStore.getState().user,
    ),
  ).toBeNull();
  await startAttempt(page);
  expect(await page.evaluate(() => window.cookieTest.attempt)).toBe('success');
  await expectCookie(page, 'b');
  expect(sent).toEqual([
    '/api/v1/auth/login',
    '/api/v1/auth/logout',
    '/api/v1/auth/login',
  ]);
});
