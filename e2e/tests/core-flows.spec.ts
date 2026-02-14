import { expect, test, type APIRequestContext, type Page, type TestInfo } from "@playwright/test";

const BACKEND_BASE_URL = process.env.PLAYWRIGHT_BACKEND_URL ?? "http://localhost:8000";
const VENN_MASKS = Array.from({ length: 15 }, (_, index) => index + 1);
const ADMIN_USERNAME = process.env.PLAYWRIGHT_ADMIN_USERNAME ?? "test-admin";
const ADMIN_PASSWORD = process.env.PLAYWRIGHT_ADMIN_PASSWORD ?? "test-password";
const NEW_USER_PASSWORD = process.env.PLAYWRIGHT_NEW_USER_PASSWORD ?? "pass123";

async function login(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByTestId("login-username").fill(ADMIN_USERNAME);
  await page.getByTestId("login-password").fill(ADMIN_PASSWORD);
  await page.getByTestId("login-submit").click();
  await expect(page.getByRole("heading", { name: "Groups" })).toBeVisible();
}

async function adminToken(request: APIRequestContext): Promise<string> {
  const response = await request.post(`${BACKEND_BASE_URL}/auth/login`, {
    data: { username: ADMIN_USERNAME, password: ADMIN_PASSWORD },
  });
  expect(response.ok()).toBeTruthy();
  const payload = (await response.json()) as { access_token: string };
  return payload.access_token;
}

async function seedCategory(
  request: APIRequestContext,
  suffix: string,
): Promise<{ groupId: number; categoryId: number }> {
  const token = await adminToken(request);
  const groupResponse = await request.post(`${BACKEND_BASE_URL}/groups`, {
    data: { name: `mobile-group-${suffix}`, member_limit: 2 },
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(groupResponse.ok()).toBeTruthy();
  const groupPayload = (await groupResponse.json()) as { id: number };

  const categoryResponse = await request.post(`${BACKEND_BASE_URL}/categories`, {
    data: { group_id: groupPayload.id, name: `mobile-category-${suffix}` },
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(categoryResponse.ok()).toBeTruthy();
  const categoryPayload = (await categoryResponse.json()) as { id: number };

  return { groupId: groupPayload.id, categoryId: categoryPayload.id };
}

async function createAndAddMember(page: Page, username: string): Promise<void> {
  await page.getByTestId("new-user-username").fill(username);
  await page.getByTestId("new-user-password").fill(NEW_USER_PASSWORD);
  const usersRefresh = page.waitForResponse(
    (response) => response.url().endsWith("/api/users") && response.request().method() === "GET",
  );
  const membersRefresh = page.waitForResponse((response) =>
    response.url().includes("/api/groups/") && response.url().endsWith("/members") && response.request().method() === "GET",
  );
  await page.getByTestId("new-user-submit").click();
  await Promise.all([usersRefresh, membersRefresh]);

  const option = page.locator("select[data-testid=\"member-user-select\"] option", { hasText: username });
  await expect(option.first()).toBeVisible();
  await page.getByTestId("member-user-select").selectOption({ label: username });

  const membersReload = page.waitForResponse((response) =>
    response.url().includes("/api/groups/") && response.url().endsWith("/members") && response.request().method() === "GET",
  );
  const usersReload = page.waitForResponse(
    (response) => response.url().endsWith("/api/users") && response.request().method() === "GET",
  );
  await page.getByTestId("member-add-button").click();
  await Promise.all([membersReload, usersReload]);
  await expect(page.getByText(username)).toBeVisible();
}

test("desktop core flow exercises the primary UI", async ({ page }, testInfo: TestInfo) => {
  test.skip(testInfo.project.name !== "chromium", "desktop flow runs on the chromium project only");

  const suffix = `${Date.now()}`;
  const groupName = `e2e-group-${suffix}`;
  const categoryName = `e2e-category-${suffix}`;
  const userOne = `e2e-user-one-${suffix}`;
  const userTwo = `e2e-user-two-${suffix}`;
  const itemText = `Item ${suffix}`;

  await login(page);

  await page.getByTestId("group-name-input").fill(groupName);
  await page.getByTestId("group-member-limit").selectOption("4");
  await page.getByTestId("group-create-button").click();
  await expect(page.getByText(groupName)).toBeVisible();

  await createAndAddMember(page, userOne);
  await createAndAddMember(page, userTwo);

  const groupCard = page.locator("li", { hasText: groupName }).first();
  await groupCard.getByRole("link", { name: "Open Categories" }).click();
  await expect(page.getByRole("heading", { name: "Categories" })).toBeVisible();

  await page.getByTestId("category-name-input").fill(categoryName);
  await page.getByTestId("category-create-button").click();
  await expect(page.getByText(categoryName)).toBeVisible();

  const categoryCard = page.locator("li", { hasText: categoryName }).first();
  await categoryCard.getByRole("link", { name: "Items" }).click();
  await expect(page.getByRole("heading", { name: "Items" })).toBeVisible();

  await page.getByTestId("item-text-input").fill(itemText);
  const itemMemberChecks = page.locator("[data-testid^=\"item-member-\"]");
  await itemMemberChecks.nth(0).check();
  await itemMemberChecks.nth(1).check();
  await page.getByTestId("item-create-button").click();
  await expect(page.getByText(itemText)).toBeVisible();

  await page.getByRole("link", { name: "Open Venn" }).click();
  await expect(page.getByRole("heading", { name: "Venn" })).toBeVisible();

  for (const mask of VENN_MASKS) {
    await page.getByTestId(`venn-region-${mask}`).click();
    await expect(page.getByRole("heading", { name: `Section ${mask}` })).toBeVisible();
  }

  const finalMask = VENN_MASKS[VENN_MASKS.length - 1];
  const refreshResponse = page.waitForResponse((response) =>
    response.url().includes("/api/categories/") && response.url().includes("/venn") && response.request().method() === "GET",
  );
  await Promise.all([refreshResponse, page.getByTestId("venn-refresh").click()]);
  await expect(page.getByRole("heading", { name: `Section ${finalMask}` })).toBeVisible();
});

test("mobile fallback renders the list view", async ({ page, request }, testInfo: TestInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium", "mobile fallback runs on the mobile chromium project only");

  const suffix = `${Date.now()}`;
  const { groupId, categoryId } = await seedCategory(request, suffix);

  await login(page);
  await page.goto(`/categories/${categoryId}/venn?groupId=${groupId}`);

  await expect(page.getByText("Sections (mobile fallback)")).toBeVisible();
  await page.getByTestId("venn-mobile-section-1").click();
  await expect(page.getByRole("heading", { name: "Section 1" })).toBeVisible();
  await page.getByTestId("venn-mobile-section-15").click();
  await expect(page.getByRole("heading", { name: "Section 15" })).toBeVisible();
});
