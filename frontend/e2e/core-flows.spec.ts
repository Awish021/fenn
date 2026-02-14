import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

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
  const response = await request.post("/api/auth/login", {
    data: { username: ADMIN_USERNAME, password: ADMIN_PASSWORD },
  });
  expect(response.ok()).toBeTruthy();
  return (await response.json()).access_token as string;
}

async function seedCategory(request: APIRequestContext, suffix: string): Promise<number> {
  const token = await adminToken(request);
  const groupResponse = await request.post("/api/groups", {
    data: { name: `mobile-group-${suffix}`, member_limit: 2 },
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(groupResponse.ok()).toBeTruthy();
  const groupId = (await groupResponse.json()).id as number;

  const categoryResponse = await request.post("/api/categories", {
    data: { group_id: groupId, name: `mobile-category-${suffix}` },
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(categoryResponse.ok()).toBeTruthy();
  return (await categoryResponse.json()).id as number;
}

test("desktop core flow: login, groups, members, categories, items, venn", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "Desktop flow runs on chromium project only");

  const suffix = Date.now();
  const groupName = `e2e-group-${suffix}`;
  const categoryName = `e2e-category-${suffix}`;
  const userOne = `e2e_u1_${suffix}`;
  const userTwo = `e2e_u2_${suffix}`;

  await login(page);

  await page.getByTestId("group-name-input").fill(groupName);
  await page.getByTestId("group-member-limit").selectOption("4");
  await page.getByTestId("group-create-button").click();
  await expect(page.getByText(groupName)).toBeVisible();

  await page.getByTestId("new-user-username").fill(userOne);
  await page.getByTestId("new-user-password").fill(NEW_USER_PASSWORD);
  await page.getByTestId("new-user-submit").click();
  await page.getByTestId("new-user-username").fill(userTwo);
  await page.getByTestId("new-user-password").fill(NEW_USER_PASSWORD);
  await page.getByTestId("new-user-submit").click();

  await page.getByTestId("member-user-select").selectOption({ label: userOne });
  await page.getByTestId("member-add-button").click();
  await page.getByTestId("member-user-select").selectOption({ label: userTwo });
  await page.getByTestId("member-add-button").click();
  await expect(page.getByText(userOne)).toBeVisible();
  await expect(page.getByText(userTwo)).toBeVisible();

  const groupCard = page.locator("li", { hasText: groupName }).first();
  await groupCard.getByRole("link", { name: "Open Categories" }).click();
  await expect(page.getByRole("heading", { name: "Categories" })).toBeVisible();

  await page.getByTestId("category-name-input").fill(categoryName);
  await page.getByTestId("category-create-button").click();
  await expect(page.getByText(categoryName)).toBeVisible();

  await page.getByRole("link", { name: "Items" }).first().click();
  await expect(page.getByRole("heading", { name: "Items" })).toBeVisible();

  await page.getByTestId("item-text-input").fill(`Item ${suffix}`);
  const itemMemberChecks = page.locator('[data-testid^="item-member-"]');
  await itemMemberChecks.nth(0).check();
  await itemMemberChecks.nth(1).check();
  await page.getByTestId("item-create-button").click();
  await expect(page.getByText(`Item ${suffix}`)).toBeVisible();

  await page.getByRole("link", { name: "Open Venn" }).click();
  await expect(page.getByRole("heading", { name: "Venn" })).toBeVisible();

  await page.getByTestId("venn-region-3").click();
  await page.getByTestId("venn-region-15").click();
  await page.getByTestId("venn-refresh").click();
  await expect(page.getByText("Section 15")).toBeVisible();
});

test("mobile fallback shows list sections", async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium", "Mobile fallback runs on mobile project only");

  const categoryId = await seedCategory(request, String(Date.now()));

  await login(page);
  await page.goto(`/categories/${categoryId}/venn`);

  await expect(page.getByText("Sections (mobile fallback)")).toBeVisible();
  await page.getByTestId("venn-mobile-section-1").click();
  await page.getByTestId("venn-mobile-section-15").click();
  await expect(page.getByText("Section 15")).toBeVisible();
});
