import { test, expect, type Locator, type Page } from "@playwright/test";
import { Client } from "pg";
import { ADMIN_STORAGE_STATE } from "./helpers/admin-session";
import { readBackendEnv } from "./helpers/backend-env";

/**
 * Gestione dei ruoli personalizzati dall'area amministrativa (ADR-99 § 10, SPEC-RBAC-F2b):
 * navigazione su `/roles`, drawer di creazione e modifica con la matrice a checkbox delle sei
 * categorie del registro, assegnazione del ruolo a un utente nel campo "Ruoli aggiuntivi" di
 * `/users`, revoca ed eliminazione.
 *
 * Gira come SuperAdmin, l'unico con `roles:manage` (ADR-99 P2): ogni permesso è selezionabile
 * tranne `roles:manage`, riservato ai ruoli di sistema. I passi dipendono l'uno dall'altro
 * (stesso ruolo, stesso utente), quindi la suite è seriale. Ruolo e utente hanno codici e email
 * univoci per run; `afterAll` li rimuove dal DB anche se un passo intermedio fallisce, perché
 * l'API non espone l'eliminazione degli utenti e un ruolo assegnato non si può eliminare.
 */

const RUN_ID = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const ROLE_CODE = `e2e_ruolo_${RUN_ID}`;
const ROLE_NAME = `Ruolo E2E ${RUN_ID}`;
const ROLE_NAME_EDITED = `${ROLE_NAME} (modificato)`;
const USER_EMAIL = `rbac-e2e-${RUN_ID}@example.com`;
const USER_NAME = "Utente";
const USER_SURNAME = `RBAC ${RUN_ID}`;

/** Le sei categorie del registro, con le etichette italiane della matrice. */
const CATEGORY_LABELS = [
  "Pagine",
  "Struttura",
  "Media",
  "Moduli",
  "Impostazioni",
  "Utenti",
];

test.use({ storageState: ADMIN_STORAGE_STATE });
test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("tour_completed", "true");
    window.localStorage.setItem("mfaPromptShown", "true");
  });
});

test.afterAll(async () => {
  const db = new Client({ connectionString: readBackendEnv("DATABASE_URL") });
  await db.connect();
  try {
    // `user_roles` va in cascata con l'utente; l'audit log mette `user_id` a null.
    await db.query("DELETE FROM users WHERE email = $1", [USER_EMAIL]);
    await db.query("DELETE FROM roles WHERE code = $1", [ROLE_CODE]);
  } finally {
    await db.end();
  }
});

/** Drawer laterale aperto con il titolo dato (FormDrawer: dialog Mantine). */
function drawer(page: Page, title: string | RegExp): Locator {
  return page.getByRole("dialog").filter({ hasText: title });
}

/** Riga della tabella dei ruoli con il codice dato. */
function roleRow(page: Page): Locator {
  return page.getByRole("row").filter({ hasText: ROLE_CODE });
}

/** Checkbox di un permesso nella matrice, per la sua descrizione del registro. */
function permissionCheckbox(scope: Locator, description: string): Locator {
  return scope.getByRole("checkbox", { name: description, exact: true });
}

function isRoleWrite(method: string, pathSuffix: RegExp) {
  return (response: { request(): { method(): string }; url(): string }) =>
    response.request().method() === method &&
    pathSuffix.test(new URL(response.url()).pathname);
}

/** Porta la lista utenti alla sola riga dell'utente di test. */
async function filterUsers(page: Page): Promise<Locator> {
  await page.getByPlaceholder("Cerca...").fill(USER_EMAIL);
  const row = page.getByRole("row").filter({ hasText: USER_EMAIL });
  await expect(row).toHaveCount(1);
  return row;
}

test('la voce "Ruoli" porta a /roles con i quattro ruoli di sistema in sola lettura', async ({
  page,
}) => {
  await page.goto("/dashboard");
  await page.getByRole("link", { name: "Ruoli", exact: true }).click();

  await expect(page).toHaveURL(/\/roles$/);
  await expect(
    page.getByRole("heading", { name: "Ruoli e permessi" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Nuovo ruolo" })).toBeVisible();

  const systemRows = page.getByRole("row").filter({ hasText: "Sistema" });
  await expect(systemRows).toHaveCount(4);
  // P3: un ruolo di sistema si consulta soltanto.
  const firstSystemRow = systemRows.first();
  await expect(
    firstSystemRow.getByRole("button", { name: "Visualizza" }),
  ).toBeVisible();
  await expect(
    firstSystemRow.getByRole("button", { name: "Modifica" }),
  ).toHaveCount(0);
  await expect(
    firstSystemRow.getByRole("button", { name: "Elimina" }),
  ).toHaveCount(0);

  await firstSystemRow.getByRole("button", { name: "Visualizza" }).click();
  const view = drawer(page, /^Ruolo: /);
  await expect(view).toBeVisible();
  await expect(view.getByRole("button", { name: "Salva" })).toHaveCount(0);
  await expect(view.getByRole("checkbox").first()).toBeDisabled();
  await view.getByRole("button", { name: "Chiudi" }).last().click();
  await expect(view).toBeHidden();
});

test("crea un ruolo personalizzato dalla matrice dei permessi a sei categorie", async ({
  page,
}) => {
  await page.goto("/roles");
  await page.getByRole("button", { name: "Nuovo ruolo" }).click();

  const create = drawer(page, "Nuovo ruolo");
  await expect(create).toBeVisible();

  // Matrice: un blocco "Seleziona tutti" per ognuna delle sei categorie, nell'ordine del registro.
  const categoryToggles = create.getByRole("checkbox", {
    name: /^Seleziona tutti: /,
  });
  await expect(categoryToggles).toHaveCount(CATEGORY_LABELS.length);
  for (const [index, label] of CATEGORY_LABELS.entries()) {
    await expect(categoryToggles.nth(index)).toHaveAccessibleName(
      `Seleziona tutti: ${label}`,
    );
  }
  // `roles:manage` resta bloccato anche per il SuperAdmin.
  await expect(
    permissionCheckbox(
      create,
      "Creare, modificare ed eliminare ruoli personalizzati",
    ),
  ).toBeDisabled();

  await create.getByLabel("Codice").fill(ROLE_CODE);
  await create.getByLabel("Nome").fill(ROLE_NAME);
  await create
    .getByLabel("Descrizione")
    .fill("Ruolo creato dalla suite E2E RBAC.");

  await create
    .getByRole("checkbox", { name: "Seleziona tutti: Media" })
    .check();
  await permissionCheckbox(
    create,
    "Pubblicare, programmare e archiviare una Pagina",
  ).check();
  await permissionCheckbox(create, "Leggere gli Invii dei moduli").check();
  await expect(create.getByTestId("permission-count")).toHaveText(
    "4 permessi selezionati",
  );

  const created = page.waitForResponse(
    isRoleWrite("POST", /\/app\/admin\/roles$/),
  );
  await create.getByRole("button", { name: "Salva" }).click();
  const response = await created;
  expect(response.status()).toBe(201);
  expect(response.request().postDataJSON()).toEqual({
    code: ROLE_CODE,
    name: ROLE_NAME,
    description: "Ruolo creato dalla suite E2E RBAC.",
    permissionCodes: expect.arrayContaining([
      "media:upload",
      "media:delete_any",
      "pages:publish",
      "forms:read_submissions",
    ]),
  });

  await expect(create).toBeHidden();
  const row = roleRow(page);
  await expect(row).toContainText(ROLE_NAME);
  await expect(row).toContainText("Personalizzato");
  await expect(row.getByRole("button", { name: "Modifica" })).toBeVisible();
});

test("modifica nome e permessi del ruolo: il codice resta immutabile", async ({
  page,
}) => {
  await page.goto("/roles");
  await roleRow(page).getByRole("button", { name: "Modifica" }).click();

  const edit = drawer(page, `Modifica ruolo: ${ROLE_NAME}`);
  await expect(edit).toBeVisible();
  await expect(edit.getByTestId("role-code")).toHaveText(ROLE_CODE);
  await expect(edit.getByLabel("Codice")).toHaveCount(0);
  await expect(edit.getByTestId("permission-count")).toHaveText(
    "4 permessi selezionati",
  );

  await edit.getByLabel("Nome").fill(ROLE_NAME_EDITED);
  await permissionCheckbox(edit, "Leggere gli Invii dei moduli").uncheck();
  await permissionCheckbox(edit, "Consultare gli utenti").check();
  await permissionCheckbox(edit, "Gestire le Sezioni globali").check();
  await expect(edit.getByTestId("permission-count")).toHaveText(
    "5 permessi selezionati",
  );

  const updated = page.waitForResponse(
    isRoleWrite("PATCH", /\/app\/admin\/roles\/[^/]+$/),
  );
  await edit.getByRole("button", { name: "Salva" }).click();
  const response = await updated;
  expect(response.status()).toBe(200);
  const body = response.request().postDataJSON() as Record<string, unknown>;
  expect(body).not.toHaveProperty("code");
  expect(body.name).toBe(ROLE_NAME_EDITED);
  expect([...(body.permissionCodes as string[])].sort()).toEqual([
    "global_sections:manage",
    "media:delete_any",
    "media:upload",
    "pages:publish",
    "users:read",
  ]);

  await expect(edit).toBeHidden();
  await expect(roleRow(page)).toContainText(ROLE_NAME_EDITED);
});

test("assegna il ruolo personalizzato a un utente in /users e lo ritrova in modifica", async ({
  page,
}) => {
  await page.goto("/users");
  await page.getByRole("button", { name: "Nuovo Utente" }).click();

  const create = drawer(page, "Nuovo Utente");
  await expect(create).toBeVisible();
  await create.getByLabel("Nome").fill(USER_NAME);
  await create.getByLabel("Cognome").fill(USER_SURNAME);
  await create.getByLabel("Email").fill(USER_EMAIL);
  // Ruolo base: resta il default del form (User).

  const rolesField = create.getByRole("textbox", { name: "Ruoli aggiuntivi" });
  await expect(rolesField).toBeEnabled();
  await rolesField.click();
  await page.getByRole("option", { name: new RegExp(ROLE_CODE) }).click();
  await create.getByLabel("Email").click(); // chiude il dropdown del MultiSelect

  const userCreated = page.waitForResponse(
    isRoleWrite("POST", /\/app\/admin\/users$/),
  );
  await create.getByRole("button", { name: "Salva" }).click();
  const response = await userCreated;
  expect(response.status()).toBe(201);
  const payload = response.request().postDataJSON() as { roleGuids?: string[] };
  expect(payload.roleGuids).toHaveLength(1);
  await expect(create).toBeHidden();

  // Il ruolo arriva dal dettaglio utente (S19), non dalla riga della lista.
  const row = await filterUsers(page);
  const detail = page.waitForResponse(
    (r) =>
      r.request().method() === "GET" &&
      /\/app\/admin\/users\/[^/]+$/.test(r.url()),
  );
  await row.getByRole("button", { name: "Modifica" }).click();
  const detailBody = (await (await detail).json()) as {
    roles: { code: string }[];
  };
  expect(detailBody.roles.map((role) => role.code)).toEqual([ROLE_CODE]);

  const edit = drawer(page, "Modifica Utente");
  await expect(edit).toBeVisible();
  await expect(edit.getByText(ROLE_NAME_EDITED, { exact: true })).toBeVisible();
  await edit.getByRole("button", { name: "Annulla" }).click();
  await expect(edit).toBeHidden();
});

test("un ruolo assegnato non si elimina; revocato dall'utente, si elimina", async ({
  page,
}) => {
  await page.goto("/roles");
  await roleRow(page).getByRole("button", { name: "Elimina" }).click();
  const inUse = page.waitForResponse(
    isRoleWrite("DELETE", /\/app\/admin\/roles\/[^/]+$/),
  );
  await page
    .getByRole("dialog", { name: "Elimina ruolo" })
    .getByRole("button", { name: "Elimina" })
    .click();
  expect((await inUse).status()).toBe(409);
  await expect(page.getByText(/Ruoli aggiuntivi/).first()).toBeVisible();
  await expect(roleRow(page)).toHaveCount(1);

  // Revoca dal campo "Ruoli aggiuntivi" dell'utente.
  await page.goto("/users");
  const row = await filterUsers(page);
  await row.getByRole("button", { name: "Modifica" }).click();
  const edit = drawer(page, "Modifica Utente");
  await expect(edit.getByText(ROLE_NAME_EDITED, { exact: true })).toBeVisible();
  await edit.getByRole("textbox", { name: "Ruoli aggiuntivi" }).focus();
  await page.keyboard.press("Backspace");
  await expect(edit.getByText(ROLE_NAME_EDITED, { exact: true })).toHaveCount(
    0,
  );

  const userUpdated = page.waitForResponse(
    isRoleWrite("PATCH", /\/app\/admin\/users\/[^/]+$/),
  );
  await edit.getByRole("button", { name: "Salva" }).click();
  const updateResponse = await userUpdated;
  expect(updateResponse.status()).toBe(200);
  expect(updateResponse.request().postDataJSON()).toMatchObject({
    roleGuids: [],
  });
  await expect(edit).toBeHidden();

  await page.goto("/roles");
  await roleRow(page).getByRole("button", { name: "Elimina" }).click();
  const deleted = page.waitForResponse(
    isRoleWrite("DELETE", /\/app\/admin\/roles\/[^/]+$/),
  );
  await page
    .getByRole("dialog", { name: "Elimina ruolo" })
    .getByRole("button", { name: "Elimina" })
    .click();
  expect((await deleted).status()).toBeLessThan(300);
  await expect(roleRow(page)).toHaveCount(0);
});
