# Template — Nuovo Modulo Backend NestJS

> Copia questa struttura quando crei un nuovo modulo.
> Sostituisci `<modulo>` con il nome del modulo in minuscolo (es. `prodotti`, `ordini`).
> Sostituisci `<Modulo>` con il nome in PascalCase (es. `Prodotti`, `Ordini`).
> Sostituisci `<ModuloEntity>` con il nome dell'entità Drizzle (es. `productEntity`).

---

## Struttura cartelle

```
src/<modulo>/
├── <modulo>.module.ts
├── <modulo>.controller.ts
├── <modulo>.service.ts
└── dto/
    ├── create-<modulo>.dto.ts
    └── update-<modulo>.dto.ts
```

---

## `<modulo>.module.ts`

```typescript
import { Module } from '@nestjs/common';
import { <Modulo>Controller } from './<modulo>.controller';
import { <Modulo>Service } from './<modulo>.service';

@Module({
  controllers: [<Modulo>Controller],
  providers: [<Modulo>Service],
  exports: [<Modulo>Service],
})
export class <Modulo>Module {}
```

---

## `<modulo>.controller.ts`

```typescript
import {
  Controller, Get, Post, Patch, Delete,
  Param, Query, Body, Req, UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { <Modulo>Service } from './<modulo>.service';
import { Create<Modulo>Dto } from './dto/create-<modulo>.dto';
import { Update<Modulo>Dto } from './dto/update-<modulo>.dto';
import { AuthInfo } from '../common/types';
import { GuardManager } from '../auth/guard';
// import { GuardAdmin, GuardSuperAdmin } from '../auth/guard'; // usare per soglie più alte

@UseGuards(GuardManager)
@Controller('app/<modulo>')
export class <Modulo>Controller {
  constructor(private readonly <modulo>Service: <Modulo>Service) {}

  @Get()
  findAll(
    @Query('p') p = '1',
    @Query('i') i = '20',
    @Query('q') q?: string,
    @Query('o') o?: string,
    @Query('d') d?: string,
    @Req() req: Request,
  ) {
    const authInfo = req['authInfo'] as AuthInfo;
    return this.<modulo>Service.findAll(authInfo, {
      p: +p, i: +i, q, o, d,
    });
  }

  @Get(':guid')
  findOne(@Param('guid') guid: string, @Req() req: Request) {
    const authInfo = req['authInfo'] as AuthInfo;
    return this.<modulo>Service.findOne(guid, authInfo);
  }

  @Post()
  create(@Body() dto: Create<Modulo>Dto, @Req() req: Request) {
    const authInfo = req['authInfo'] as AuthInfo;
    return this.<modulo>Service.create(dto, authInfo);
  }

  @Patch(':guid')
  update(
    @Param('guid') guid: string,
    @Body() dto: Update<Modulo>Dto,
    @Req() req: Request,
  ) {
    const authInfo = req['authInfo'] as AuthInfo;
    return this.<modulo>Service.update(guid, dto, authInfo);
  }

  @Delete(':guid')
  remove(@Param('guid') guid: string, @Req() req: Request) {
    const authInfo = req['authInfo'] as AuthInfo;
    return this.<modulo>Service.remove(guid, authInfo);
  }
}
```

> Nota: `guid` è l'identificativo esposto nelle **URL amministrative** (MAI `id` numerico
> sequenziale — vedi CLAUDE.md → "Divieti assoluti"). Le URL della superficie pubblica
> `api/v1/public/*` usano invece lo `slug` (+ `locale`) e non passano da questo template:
> sono di sola lettura, servono solo contenuto `published` e rispondono `404` — mai `403` —
> per ciò che non è pubblicato. Il metodo `DELETE` qui sopra esegue comunque un soft delete
> internamente (`isActive = false`), mai una `DELETE` SQL fisica.

---

## `<modulo>.service.ts`

```typescript
import {
  Injectable, Logger, NotFoundException, ConflictException,
} from '@nestjs/common';
import { eq, and, ilike, sql, desc, asc } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { <ModuloEntity> } from '../db/schema';
import { Pagination } from '../common/pagination';
import { Utils } from '../common/utils';
import { AuthInfo, PaginationParams } from '../common/types';
import { Create<Modulo>Dto } from './dto/create-<modulo>.dto';
import { Update<Modulo>Dto } from './dto/update-<modulo>.dto';

@Injectable()
export class <Modulo>Service {
  private readonly logger = new Logger(<Modulo>Service.name);

  constructor(private readonly db: DbService) {}

  async findAll(authInfo: AuthInfo, params: PaginationParams) {
    const { p, i, q, o, d } = params;
    const offset = (p - 1) * i;

    // OBBLIGATORIO se il modulo gestisce dati multi-tenant/multi-sede:
    // const scopeId = Utils.applyScopeFilter(authInfo);
    // if (scopeId) conditions.push(eq(<ModuloEntity>.scopeId, scopeId));

    const conditions = [eq(<ModuloEntity>.isActive, true)];
    if (q) conditions.push(ilike(<ModuloEntity>.nome, `%${q}%`)); // adatta il campo

    const orderCol = <ModuloEntity>[o as keyof typeof <ModuloEntity>.$inferSelect] ?? <ModuloEntity>.id;
    const orderDir = d === 'desc' ? desc(orderCol) : asc(orderCol);

    const [items, [{ count }]] = await Promise.all([
      this.db.db
        .select()
        .from(<ModuloEntity>)
        .where(and(...conditions))
        .orderBy(orderDir)
        .limit(i)
        .offset(offset),
      this.db.db
        .select({ count: sql<number>`count(*)::int` })
        .from(<ModuloEntity>)
        .where(and(...conditions)),
    ]);

    return new Pagination(items, count, p, i);
  }

  async findOne(guid: string, authInfo: AuthInfo) {
    const [item] = await this.db.db
      .select()
      .from(<ModuloEntity>)
      .where(and(eq(<ModuloEntity>.guid, guid), eq(<ModuloEntity>.isActive, true)));

    if (!item) throw new NotFoundException('<Modulo> non trovato');
    return item;
  }

  async create(dto: Create<Modulo>Dto, authInfo: AuthInfo) {
    const [created] = await this.db.db
      .insert(<ModuloEntity>)
      .values({
        ...dto,
        guid: Utils.randomString(16),
        createdBy: authInfo.id,
        updatedBy: authInfo.id,
      })
      .returning({ guid: <ModuloEntity>.guid });

    this.logger.log(`Creato <modulo> ${created.guid} da utente #${authInfo.id}`);
    return created;
  }

  async update(guid: string, dto: Update<Modulo>Dto, authInfo: AuthInfo) {
    await this.findOne(guid, authInfo); // verifica esistenza

    // LOCK OTTIMISTICO OBBLIGATORIO — il client rimanda la `version` che ha letto.
    // Zero righe aggiornate ⇒ qualcun altro ha scritto nel frattempo ⇒ 409.
    // Mai sovrascrivere silenziosamente il lavoro di un altro utente.
    const [updated] = await this.db.db
      .update(<ModuloEntity>)
      .set({
        ...dto,
        version: sql`${<ModuloEntity>.version} + 1`,
        updatedBy: authInfo.id,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(<ModuloEntity>.guid, guid),
          eq(<ModuloEntity>.version, dto.version),
        ),
      )
      .returning({ guid: <ModuloEntity>.guid, version: <ModuloEntity>.version });

    if (!updated) {
      throw new ConflictException(
        'Il record è stato modificato da un altro utente. Ricarica e riprova.',
      );
    }

    return updated;
  }

  async remove(guid: string, authInfo: AuthInfo) {
    await this.findOne(guid, authInfo); // verifica esistenza

    // SOFT DELETE — mai DELETE fisico
    const [removed] = await this.db.db
      .update(<ModuloEntity>)
      .set({ isActive: false, updatedBy: authInfo.id, updatedAt: new Date() })
      .where(eq(<ModuloEntity>.guid, guid))
      .returning({ guid: <ModuloEntity>.guid });

    return removed;
  }
}
```

---

## `dto/create-<modulo>.dto.ts`

```typescript
import { ApiProperty } from '@nestjs/swagger';
import {
  IsString, IsNotEmpty, IsOptional, MaxLength,
} from 'class-validator';

export class Create<Modulo>Dto {
  @ApiProperty({ example: 'Nome esempio', maxLength: 200 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  nome: string; // adatta i campi al modulo

  @ApiProperty({ example: 'Nota opzionale', required: false, maxLength: 500 })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  note?: string;
}
```

---

## `dto/update-<modulo>.dto.ts`

```typescript
import { PartialType } from '@nestjs/mapped-types';
import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { Create<Modulo>Dto } from './create-<modulo>.dto';

export class Update<Modulo>Dto extends PartialType(Create<Modulo>Dto) {
  /**
   * Versione della riga letta dal client, base del lock ottimistico.
   * Obbligatoria: senza, l'update sovrascriverebbe silenziosamente
   * il lavoro di un altro utente (vietato — vedi CLAUDE.md → "Divieti assoluti").
   */
  @ApiProperty({ example: 1, description: 'Versione letta dal client (lock ottimistico)' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version: number;
}
```

> `version` non è opzionale nemmeno in un DTO di update parziale: è il pegno di
> concorrenza. Un client che non la manda riceve `400`; un client che ne manda una
> superata riceve `409`.

---

## Checklist prima del commit

- [ ] Modulo registrato in `app.module.ts`
- [ ] Guard applicato (`@UseGuards(GuardManager)`, `GuardAdmin` o `GuardSuperAdmin` secondo la soglia)
- [ ] `Utils.applyScopeFilter(authInfo)` applicato se il modulo gestisce dati multi-tenant/multi-sede
- [ ] Soft delete implementato (mai `DELETE` fisico)
- [ ] Lock ottimistico su `update` (`WHERE version = :version` + incremento, zero righe ⇒ `409`)
- [ ] `guid` usato nelle URL amministrative, mai l'`id` numerico (superficie pubblica: `slug`)
- [ ] Audit trail: `createdBy` e `updatedBy` popolati
- [ ] DTO con `class-validator` + `@ApiProperty()` su ogni campo
- [ ] Logger NestJS inizializzato (`new Logger(NomeService.name)`)
- [ ] Nessuna stringa magica — usare enum da `src/common/enums.ts`
- [ ] `Pagination<T>` usata per endpoint lista
- [ ] Collezione Bruno creata in `bruno/<modulo>/` per ogni endpoint
