/**
 * Unit test della logica pura del ridimensionamento orizzontale di `container` (E03):
 * lettura della prop dal registro, conversione puntatore → percentuale, formattazione del
 * badge. Nessun DOM montato — è esattamente il motivo per cui questa logica vive fuori dal
 * componente.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  CONTAINER_WIDTH_PROP,
  clampContainerWidthPercent,
  containerWidthPercentFromPointer,
  formatContainerWidthBadge,
  readContainerWidthPercent,
  resolveContainerWidthSpec,
  toContainerWidthValue,
} from './container-resize.utils';

const SPEC = { min: 5, max: 100 };

afterEach(() => {
  vi.resetModules();
  vi.doUnmock('../../../types/blocks.types');
});

describe('resolveContainerWidthSpec — la prop deve essere dichiarata dal registro', () => {
  it('restituisce min/max sul registro reale: container.block.ts dichiara styleFlexBasis (unitValue, %, 0-100)', () => {
    expect(resolveContainerWidthSpec()).toEqual({ min: 0, max: 100 });
  });

  it('restituisce min/max quando il registro dichiara la prop come unitValue in percentuale', async () => {
    vi.doMock('../../../types/blocks.types', async (importOriginal) => {
      const actual = await importOriginal<typeof import('../../../types/blocks.types')>();
      return {
        ...actual,
        BLOCK_TYPES: actual.BLOCK_TYPES.map((descriptor) =>
          descriptor.type === 'container'
            ? {
                ...descriptor,
                props: descriptor.props.map((entry) =>
                  entry.name === CONTAINER_WIDTH_PROP
                    ? {
                        name: CONTAINER_WIDTH_PROP,
                        kind: 'unitValue' as const,
                        required: false,
                        units: ['%'] as const,
                        min: 5,
                        max: 100,
                      }
                    : entry,
                ),
              }
            : descriptor,
        ),
      };
    });
    const { resolveContainerWidthSpec: resolve } = await import('./container-resize.utils');
    expect(resolve()).toEqual({ min: 5, max: 100 });
  });

  it('restituisce null se la prop esiste col nome giusto ma di kind diverso (omonimo, non questa prop)', async () => {
    vi.doMock('../../../types/blocks.types', async (importOriginal) => {
      const actual = await importOriginal<typeof import('../../../types/blocks.types')>();
      return {
        ...actual,
        BLOCK_TYPES: actual.BLOCK_TYPES.map((descriptor) =>
          descriptor.type === 'container'
            ? {
                ...descriptor,
                props: descriptor.props.map((entry) =>
                  entry.name === CONTAINER_WIDTH_PROP
                    ? { name: CONTAINER_WIDTH_PROP, kind: 'plainText' as const, required: false }
                    : entry,
                ),
              }
            : descriptor,
        ),
      };
    });
    const { resolveContainerWidthSpec: resolve } = await import('./container-resize.utils');
    expect(resolve()).toBeNull();
  });
});

describe('containerWidthPercentFromPointer', () => {
  it('metà della larghezza del padre → 50%', () => {
    expect(containerWidthPercentFromPointer(400, 0, 800, SPEC)).toBe(50);
  });

  it('tiene conto del bordo sinistro del nodo, non del bordo del padre', () => {
    expect(containerWidthPercentFromPointer(500, 100, 800, SPEC)).toBe(50);
  });

  it('arrotonda a un decimale (un terzo → 33.3%)', () => {
    expect(containerWidthPercentFromPointer(300, 0, 900, SPEC)).toBe(33.3);
  });

  it('clampa sopra il massimo dichiarato dal registro', () => {
    expect(containerWidthPercentFromPointer(2000, 0, 800, SPEC)).toBe(100);
  });

  it('clampa sotto il minimo dichiarato dal registro, anche trascinando a sinistra dell’origine', () => {
    expect(containerWidthPercentFromPointer(-500, 0, 800, SPEC)).toBe(5);
  });

  it('padre di larghezza 0 non è ridimensionabile: null, mai una divisione per zero', () => {
    expect(containerWidthPercentFromPointer(400, 0, 0, SPEC)).toBeNull();
  });
});

describe('clampContainerWidthPercent', () => {
  it('un valore non finito ricade sul minimo, mai su NaN', () => {
    expect(clampContainerWidthPercent(Number.NaN, SPEC)).toBe(5);
  });
});

describe('readContainerWidthPercent / toContainerWidthValue', () => {
  it('legge il valore composto in percentuale', () => {
    expect(readContainerWidthPercent({ value: 33.3, unit: '%' })).toBe(33.3);
  });

  it('rifiuta un’altra unità invece di convertirla a occhio', () => {
    expect(readContainerWidthPercent({ value: 320, unit: 'px' })).toBeNull();
  });

  it('rifiuta prop assente o di forma diversa', () => {
    expect(readContainerWidthPercent(undefined)).toBeNull();
    expect(readContainerWidthPercent('50%')).toBeNull();
    expect(readContainerWidthPercent({ value: '50', unit: '%' })).toBeNull();
  });

  it('round-trip: quello che si scrive è quello che si rilegge', () => {
    expect(readContainerWidthPercent(toContainerWidthValue(66.7))).toBe(66.7);
  });
});

describe('formatContainerWidthBadge', () => {
  it('nessun decimale superfluo su un valore intero', () => {
    expect(formatContainerWidthBadge(50)).toBe('50%');
    expect(formatContainerWidthBadge(100)).toBe('100%');
  });

  it('un decimale dove serve', () => {
    expect(formatContainerWidthBadge(33.33)).toBe('33.3%');
  });
});
