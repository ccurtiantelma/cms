/**
 * Store Zustand del Template Editor (RFC-40 Opzione B — Sezioni globali e
 * layout di pagina). Tiene l'elenco dei Template di tema, il Template
 * selezionato in editing e il suo stato di salvataggio (lock ottimistico via
 * `version`, coerente con `PageGlobalSectionBuilder.tsx`). Ogni chiamata
 * passa dal service `site-templates.service.ts`: nessuna chiamata Axios diretta
 * qui dentro.
 */
import { create } from 'zustand';
import { notifications } from '@mantine/notifications';
import type { AxiosError } from 'axios';
import { getErrorMessage } from '../utils/api.utils';
import {
  create as createSiteTemplate,
  deleteTemplate as deleteSiteTemplate,
  getByGuid,
  list,
  update as updateSiteTemplate,
} from '../services/site-templates.service';
import type {
  ContentBlockNode,
  CreateSiteTemplateDto,
  DisplayConditionRule,
  QuerySiteTemplatesDto,
  SiteTemplate,
  SiteTemplateType,
  SiteTemplatesErrorData,
} from '../types/site-templates.types';

interface SiteTemplatesState {
  templates: SiteTemplate[];
  selectedTemplate: SiteTemplate | null;
  filterType: SiteTemplateType | 'all';
  filterLang: string;
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  hasUnsavedChanges: boolean;

  /** `GET /app/site-templates` — ricarica l'elenco, aggiornando i filtri correnti da `params`. */
  fetchTemplates: (params?: QuerySiteTemplatesDto) => Promise<void>;
  /** Imposta il Template attivo (ricaricato dal server per una `version` sempre fresca) o azzera la selezione con `null`. */
  selectTemplate: (guid: string | null) => Promise<void>;
  /** Aggiorna l'albero blocchi in editing del Template selezionato; porta `hasUnsavedChanges` a `true`. */
  updateDraftContentTree: (contentTree: ContentBlockNode[]) => void;
  /** Aggiorna le regole di inclusione/esclusione del Template selezionato; porta `hasUnsavedChanges` a `true`. */
  updateDisplayConditions: (conditions: DisplayConditionRule[]) => void;
  /** `PATCH /app/site-templates/:guid` — salva il draft corrente includendo `version` per il lock ottimistico. */
  saveCurrentTemplate: () => Promise<void>;
  /** `POST /app/site-templates` — crea un Template, aggiorna l'elenco e lo seleziona. */
  createTemplate: (dto: CreateSiteTemplateDto) => Promise<void>;
  /** `DELETE /app/site-templates/:guid` — rimuove il Template (soft-delete lato server). */
  deleteTemplate: (guid: string) => Promise<void>;
  /** Ripristina lo stato iniziale dello store. */
  resetStore: () => void;
}

const initialState = {
  templates: [] as SiteTemplate[],
  selectedTemplate: null as SiteTemplate | null,
  filterType: 'all' as SiteTemplateType | 'all',
  filterLang: '',
  isLoading: false,
  isSaving: false,
  error: null as string | null,
  hasUnsavedChanges: false,
};

/** Sostituisce nell'elenco il Template con lo stesso `guid`, se presente. */
function replaceInList(templates: SiteTemplate[], updated: SiteTemplate): SiteTemplate[] {
  return templates.map((template) => (template.guid === updated.guid ? updated : template));
}

export const useSiteTemplatesStore = create<SiteTemplatesState>()((set, get) => ({
  ...initialState,

  fetchTemplates: async (params) => {
    set({ isLoading: true, error: null });
    try {
      const page = await list(params);
      set({
        templates: page.items,
        filterType: params?.type ?? 'all',
        filterLang: params?.language ?? '',
      });
    } catch (err) {
      const message = getErrorMessage(err, 'Errore nel caricamento dei Template di tema');
      set({ error: message });
      notifications.show({ color: 'red', message });
    } finally {
      set({ isLoading: false });
    }
  },

  selectTemplate: async (guid) => {
    if (!guid) {
      set({ selectedTemplate: null, hasUnsavedChanges: false, error: null });
      return;
    }
    set({ isLoading: true, error: null });
    try {
      const template = await getByGuid(guid);
      set({ selectedTemplate: template, hasUnsavedChanges: false });
    } catch (err) {
      const message = getErrorMessage(err, 'Errore nel caricamento del Template di tema');
      set({ error: message });
      notifications.show({ color: 'red', message });
    } finally {
      set({ isLoading: false });
    }
  },

  updateDraftContentTree: (contentTree) => {
    const { selectedTemplate } = get();
    if (!selectedTemplate) return;
    set({
      selectedTemplate: { ...selectedTemplate, contentTree },
      hasUnsavedChanges: true,
    });
  },

  updateDisplayConditions: (conditions) => {
    const { selectedTemplate } = get();
    if (!selectedTemplate) return;
    set({
      selectedTemplate: { ...selectedTemplate, displayConditions: conditions },
      hasUnsavedChanges: true,
    });
  },

  saveCurrentTemplate: async () => {
    const { selectedTemplate } = get();
    if (!selectedTemplate) return;
    set({ isSaving: true, error: null });
    try {
      const saved = await updateSiteTemplate(selectedTemplate.guid, {
        version: selectedTemplate.version,
        title: selectedTemplate.title,
        type: selectedTemplate.type,
        contentTree: selectedTemplate.contentTree,
        isPublished: selectedTemplate.isPublished,
        language: selectedTemplate.language,
        priority: selectedTemplate.priority,
        displayConditions: selectedTemplate.displayConditions,
      });
      set((state) => ({
        selectedTemplate: saved,
        templates: replaceInList(state.templates, saved),
        hasUnsavedChanges: false,
      }));
      notifications.show({ color: 'green', message: 'Template di tema salvato' });
    } catch (err) {
      const error = err as AxiosError<SiteTemplatesErrorData>;
      if (error.response?.data?.code === 'SITE_TEMPLATE_VERSION_CONFLICT') {
        const message =
          'Il Template è stato modificato da un altro utente. Ricarica per ripartire dal contenuto aggiornato: le modifiche non salvate andranno perse.';
        set({ error: message });
        notifications.show({
          color: 'red',
          autoClose: false,
          title: 'Modifica concorrente',
          message,
        });
      } else {
        const message = getErrorMessage(err, 'Errore nel salvataggio del Template di tema');
        set({ error: message });
        notifications.show({ color: 'red', message });
      }
    } finally {
      set({ isSaving: false });
    }
  },

  createTemplate: async (dto) => {
    set({ isSaving: true, error: null });
    try {
      const created = await createSiteTemplate(dto);
      set((state) => ({
        templates: [created, ...state.templates],
        selectedTemplate: created,
        hasUnsavedChanges: false,
      }));
      notifications.show({ color: 'green', message: 'Template di tema creato' });
    } catch (err) {
      const message = getErrorMessage(err, 'Errore nella creazione del Template di tema');
      set({ error: message });
      notifications.show({ color: 'red', message });
    } finally {
      set({ isSaving: false });
    }
  },

  deleteTemplate: async (guid) => {
    set({ error: null });
    try {
      await deleteSiteTemplate(guid);
      set((state) => ({
        templates: state.templates.filter((template) => template.guid !== guid),
        selectedTemplate: state.selectedTemplate?.guid === guid ? null : state.selectedTemplate,
        hasUnsavedChanges: state.selectedTemplate?.guid === guid ? false : state.hasUnsavedChanges,
      }));
      notifications.show({ color: 'green', message: 'Template di tema eliminato' });
    } catch (err) {
      const message = getErrorMessage(err, "Errore nell'eliminazione del Template di tema");
      set({ error: message });
      notifications.show({ color: 'red', message });
    }
  },

  resetStore: () => set({ ...initialState }),
}));
