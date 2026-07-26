# Spec — F[N] [Nome Feature]

## Feature di riferimento
`docs/ai/features/F[N]-nome.md`

## ADR applicabili
[Lista ADR pertinenti, es. ADR-2-security-baseline.md]

## Outcomes tecnici
[Cosa esiste nel sistema al termine: tabelle, endpoint, componenti]

## In scope
- ...

## Out of scope
- ...

## Vincoli e assunzioni
[Stack, pattern, librerie — riferimento a constitution.md]
[Assunzioni esplicite dove la feature era ambigua]

## Schema DB (Drizzle)

### Tabelle nuove
```typescript
// schema.ts
export const nomeTabella = pgTable('nome_tabella', {
  id: serial('id').primaryKey(),
  guid: char('guid', { length: 16 }).notNull().unique(),
  // ...
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  createdBy: integer('created_by').references(() => users.id, { onDelete: 'restrict', onUpdate: 'restrict' }),
  updatedBy: integer('updated_by').references(() => users.id, { onDelete: 'restrict', onUpdate: 'restrict' }),
});
```

### Tabelle modificate
[Colonne aggiunte o modificate]

## Endpoint API

### POST api/v1/app/<modulo>
- **Guard**: GuardAdmin (o GuardManager/GuardSuperAdmin secondo la soglia richiesta)
- **Request body**: `CreateXxxDto`
- **Response 201**: `{ guid: string, ... }`
- **Response 400**: input non valido
- **Response 401**: non autenticato
- **Response 403**: permessi insufficienti

[Ripeti per ogni endpoint]

## DTO

```typescript
export class CreateXxxDto {
  @ApiProperty({ example: '...' })
  @IsString()
  @IsNotEmpty()
  nome: string;
}
```

## Contratti WebSocket (se applicabile)
[Eventi emessi, payload, namespace — solo se il modulo `realtime/` viene attivato]

## Task breakdown
- [ ] T1 — Schema DB: aggiungere entità X in schema.ts + migrazione
- [ ] T2 — Backend: modulo, controller, service, DTO per X
- [ ] T3 — Frontend: tipi, service HTTP, pagina PageX
- [ ] T4 — Test: Jest + Supertest + Bruno per gli endpoint

## Criteri di verifica
[Test cases obbligatori da soddisfare — happy path + casi di errore per ogni endpoint]
