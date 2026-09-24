import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  ALL_PERMISSION_CODES,
  computeRegistryHash,
  PERMISSION_CATEGORIES,
  PERMISSIONS,
  PermissionCode,
  SYSTEM_RESERVED_PERMISSIONS,
  SYSTEM_ROLE_CODES,
  SYSTEM_ROLES,
  SystemRoleCode,
} from '../../../src/permissions/permissions.registry';
import { AppUserRoles } from '../../../src/common/enums';

/**
 * Conformità del registro permessi (SPEC-RBAC-F1 criteri 1–4, ADR-99 §
 * Conformità). La matrice è letta **dal file** `docs/business-rules.md` a ogni
 * esecuzione: una riga aggiunta alla matrice e non classificata qui sotto, o
 * un ✅/❌ che diverge dal seed, fa fallire il test.
 */

const BUSINESS_RULES_PATH = resolve(__dirname, '../../../../../docs/business-rules.md');
const SRC_PATH = resolve(__dirname, '../../../src');

/** Colonne della matrice, nell'ordine del documento. */
const MATRIX_ROLES: readonly SystemRoleCode[] = ['superadmin', 'admin', 'manager', 'user'];

/** Righe della matrice con un codice nel registro F1. */
const MAPPED_ROWS: Readonly<Record<string, readonly PermissionCode[]>> = {
  'Creare una Pagina': ['pages:create'],
  'Modificare una Pagina propria (bozza)': ['pages:edit_own'],
  'Modificare una Pagina di altri': ['pages:edit_any'],
  'Inviare in revisione (`review`)': ['pages:submit_review'],
  'Pubblicare / programmare / archiviare': ['pages:publish'],
  'Ripristinare una Revisione passata': ['pages:restore_revision'],
  'Soft delete di una Pagina': ['pages:delete'],
  // "Menu" non ha un modulo né un codice: arriverà col modulo (ADR-99 § 4).
  'Gestire Menu, Template, Sezioni globali': ['templates:manage', 'global_sections:manage'],
  'Gestire Locale e impostazioni multilingua': ['settings:manage_locales'],
  'Gestire Media (upload)': ['media:upload'],
  'Eliminare Media di altri': ['media:delete_any'],
  'Leggere gli Invii dei moduli': ['forms:read_submissions'],
  'Gestire tema e risorse globali': ['settings:manage_theme'],
};

/** Righe senza codice in F1, con il motivo (SPEC § "Esclusi dal registro F1"). */
const EXCLUDED_ROWS: Readonly<Record<string, string>> = {
  'Definire Moduli di contatto':
    'forms:manage escluso: i Moduli si definiscono come blocchi nella Pagina (ADR-46)',
  'Configurare il chatbot': 'nessun modulo chatbot (F11 pending)',
  'Usare il blocco HTML/embed personalizzato':
    'blocks:html_embed escluso: nessun blocco HTML/embed nel registro blocchi',
  'Gestire Redirect': 'settings:manage_redirects escluso: nessun modulo Redirect',
};

/**
 * Codici non ancora applicati da alcun `@Permissions` (in F1 tutti). La lista
 * può solo accorciarsi: un codice migrato va tolto da qui, pena il fallimento.
 */
const NOT_YET_MIGRATED: readonly PermissionCode[] = [
  'pages:create',
  'pages:edit_own',
  'pages:edit_any',
  'pages:submit_review',
  'pages:publish',
  'pages:restore_revision',
  'pages:delete',
  'templates:manage',
  'global_sections:manage',
  'media:upload',
  'media:delete_any',
  'forms:read_submissions',
  'settings:manage_theme',
  'settings:manage_locales',
  'users:read',
  'users:write',
  'users:assign_roles',
  'audit:read',
];

interface MatrixRow {
  action: string;
  granted: Record<SystemRoleCode, boolean>;
}

/** Estrae le righe della tabella § "Permessi editoriali" di `business-rules.md`. */
function readMatrix(): MatrixRow[] {
  const doc = readFileSync(BUSINESS_RULES_PATH, 'utf8');
  const section = doc.split(/^## /m).find((s) => s.startsWith('Permessi editoriali'));
  if (!section) throw new Error('Sezione "Permessi editoriali" non trovata in business-rules.md');

  return section
    .split('\n')
    .filter((line) => line.startsWith('|') && /[✅❌]/.test(line))
    .map((line) => {
      const cells = line
        .split('|')
        .slice(1, -1)
        .map((c) => c.trim());
      const [action, ...marks] = cells;
      if (marks.length !== MATRIX_ROLES.length) {
        throw new Error(`Riga di matrice malformata: ${line}`);
      }
      const granted = Object.fromEntries(
        MATRIX_ROLES.map((role, i) => [role, marks[i] === '✅']),
      ) as Record<SystemRoleCode, boolean>;
      return { action, granted };
    });
}

/** Codici passati a `@Permissions(...)` in tutti i controller di `src/`. */
function codesUsedByControllers(): Set<string> {
  const used = new Set<string>();
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.controller.ts')) {
        const source = readFileSync(full, 'utf8');
        for (const call of source.matchAll(/@Permissions\(([^)]*)\)/g)) {
          for (const literal of call[1].matchAll(/['"`]([^'"`]+)['"`]/g)) used.add(literal[1]);
        }
      }
    }
  };
  walk(SRC_PATH);
  return used;
}

describe('permissions.registry — conformità (SPEC-RBAC-F1 criteri 1–4)', () => {
  describe('criterio 1: matrice business-rules ↔ seed dei ruoli di sistema', () => {
    const matrix = readMatrix();

    it('la matrice è stata letta e ogni riga è mappata o esclusa con motivo', () => {
      expect(matrix.length).toBeGreaterThan(0);
      const unclassified = matrix
        .map((r) => r.action)
        .filter((action) => !(action in MAPPED_ROWS) && !(action in EXCLUDED_ROWS));
      expect(unclassified).toEqual([]);
    });

    it('la fixture non contiene righe non più presenti nella matrice', () => {
      const actions = new Set(matrix.map((r) => r.action));
      const stale = [...Object.keys(MAPPED_ROWS), ...Object.keys(EXCLUDED_ROWS)].filter(
        (action) => !actions.has(action),
      );
      expect(stale).toEqual([]);
    });

    it.each(Object.keys(MAPPED_ROWS))('"%s": ✅/❌ identici al seed per i 4 ruoli', (action) => {
      const row = matrix.find((r) => r.action === action)!;
      for (const role of MATRIX_ROLES) {
        for (const code of MAPPED_ROWS[action]) {
          expect({ role, code, granted: SYSTEM_ROLES[role].permissions.includes(code) }).toEqual({
            role,
            code,
            granted: row.granted[role],
          });
        }
      }
    });
  });

  describe('criterio 2: codici di gestione utenti e ruoli (ADR-99 P2)', () => {
    it('roles:manage appartiene al solo superadmin ed è riservato', () => {
      const holders = SYSTEM_ROLE_CODES.filter((r) =>
        SYSTEM_ROLES[r].permissions.includes('roles:manage'),
      );
      expect(holders).toEqual(['superadmin']);
      expect(SYSTEM_RESERVED_PERMISSIONS).toContain('roles:manage');
    });

    it('admin ha roles:read, users:assign_roles, users:*, audit:read; manager e user nessuno', () => {
      const adminOnly: PermissionCode[] = [
        'users:read',
        'users:write',
        'users:assign_roles',
        'roles:read',
        'audit:read',
      ];
      for (const code of adminOnly) {
        expect(SYSTEM_ROLES.admin.permissions).toContain(code);
        expect(SYSTEM_ROLES.superadmin.permissions).toContain(code);
        expect(SYSTEM_ROLES.manager.permissions).not.toContain(code);
        expect(SYSTEM_ROLES.user.permissions).not.toContain(code);
      }
    });

    it('superadmin ha tutti i codici del registro', () => {
      expect([...SYSTEM_ROLES.superadmin.permissions].sort()).toEqual(
        [...ALL_PERMISSION_CODES].sort(),
      );
    });

    it('ogni ruolo di sistema è un sottoinsieme del ruolo con soglia più alta', () => {
      const chain: SystemRoleCode[] = ['user', 'manager', 'admin', 'superadmin'];
      for (let i = 0; i < chain.length - 1; i++) {
        const lower = SYSTEM_ROLES[chain[i]].permissions;
        const higher = new Set(SYSTEM_ROLES[chain[i + 1]].permissions);
        expect(lower.filter((c) => !higher.has(c))).toEqual([]);
      }
    });

    it('i livelli dei ruoli di sistema coincidono con AppUserRoles', () => {
      expect(SYSTEM_ROLES.superadmin.level).toBe(AppUserRoles.SuperAdmin);
      expect(SYSTEM_ROLES.admin.level).toBe(AppUserRoles.Admin);
      expect(SYSTEM_ROLES.manager.level).toBe(AppUserRoles.Manager);
      expect(SYSTEM_ROLES.user.level).toBe(AppUserRoles.User);
    });
  });

  describe('criterio 3: coerenza del registro', () => {
    it('codici univoci, formato risorsa:azione, categoria nota', () => {
      const codes = PERMISSIONS.map((p) => p.code);
      expect(new Set(codes).size).toBe(codes.length);
      for (const p of PERMISSIONS) {
        expect(p.code).toMatch(/^[a-z_]+:[a-z_]+$/);
        expect(PERMISSION_CATEGORIES).toContain(p.category);
      }
    });

    it('i codici esclusi in F1 non sono nel registro', () => {
      for (const excluded of ['forms:manage', 'settings:manage_redirects', 'blocks:html_embed']) {
        expect(ALL_PERMISSION_CODES as readonly string[]).not.toContain(excluded);
      }
    });

    it('ogni codice usato da un @Permissions nei controller è nel registro', () => {
      const unknown = [...codesUsedByControllers()].filter(
        (code) => !(ALL_PERMISSION_CODES as readonly string[]).includes(code),
      );
      expect(unknown).toEqual([]);
    });

    it('ogni codice del registro è applicato da un @Permissions oppure è in NOT_YET_MIGRATED, mai entrambi', () => {
      const used = codesUsedByControllers();
      const pending = new Set<string>(NOT_YET_MIGRATED);
      expect(ALL_PERMISSION_CODES.filter((c) => !used.has(c) && !pending.has(c))).toEqual([]);
      expect(ALL_PERMISSION_CODES.filter((c) => used.has(c) && pending.has(c))).toEqual([]);
      expect(NOT_YET_MIGRATED.filter((c) => !ALL_PERMISSION_CODES.includes(c))).toEqual([]);
    });
  });

  describe('criterio 4: hash del registro', () => {
    it('è stabile a registro invariato e ha 12 caratteri hex', () => {
      expect(computeRegistryHash()).toBe(computeRegistryHash());
      expect(computeRegistryHash()).toMatch(/^[0-9a-f]{12}$/);
    });

    it("non dipende dall'ordine di dichiarazione né dalle descrizioni", () => {
      const shuffled = [...PERMISSIONS].reverse().map((p) => ({ ...p, description: 'altro' }));
      expect(computeRegistryHash(shuffled)).toBe(computeRegistryHash());
    });

    it('cambia se si aggiunge un codice', () => {
      expect(computeRegistryHash([...PERMISSIONS, { code: 'menus:manage' }])).not.toBe(
        computeRegistryHash(),
      );
    });

    it('cambia se cambia la mappa di un ruolo di sistema', () => {
      const changed = {
        ...SYSTEM_ROLES,
        user: {
          ...SYSTEM_ROLES.user,
          permissions: [...SYSTEM_ROLES.user.permissions, 'pages:delete'],
        },
      };
      expect(computeRegistryHash(PERMISSIONS, changed)).not.toBe(computeRegistryHash());
    });
  });
});
