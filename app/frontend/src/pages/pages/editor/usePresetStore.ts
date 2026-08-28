import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { BlockNode } from './block-tree.utils';
import { serializePreset, type BlockPresetDto } from './BlockPresetManager';

export interface StoredBlockPreset extends BlockPresetDto {
  id: string;
  createdAt: string;
}

interface PresetState {
  presets: StoredBlockPreset[];
  savePreset: (name: string, node: BlockNode) => void;
  deletePreset: (id: string) => void;
  getPresets: () => StoredBlockPreset[];
}

function generatePresetId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export const usePresetStore = create<PresetState>()(
  persist(
    (set, get) => ({
      presets: [],
      savePreset: (name, node) => {
        const dto = serializePreset(node, name);
        set((state) => ({
          presets: [
            ...state.presets,
            { ...dto, id: generatePresetId(), createdAt: new Date().toISOString() },
          ],
        }));
      },
      deletePreset: (id) => set((state) => ({ presets: state.presets.filter((preset) => preset.id !== id) })),
      getPresets: () => get().presets,
    }),
    {
      name: 'eaidos_block_presets',
      storage: createJSONStorage(() => localStorage),
    },
  ),
);