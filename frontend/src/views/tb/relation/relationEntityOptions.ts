import { reactive } from 'vue';

export interface RelationEntityOption {
  label: string;
  value: string;
}

export interface RelationEntityOptionPage {
  data: RelationEntityOption[];
  hasNext: boolean;
  totalElements?: number;
}

export interface RelationEntityOptionQuery {
  entityType: string;
  page: number;
  pageSize: number;
  textSearch: string;
}

export interface RelationEntityOptionState {
  entityType?: string;
  textSearch: string;
  options: RelationEntityOption[];
  selectedOption: RelationEntityOption | null;
  nextPage: number;
  hasNext: boolean;
  totalElements: number;
  loading: boolean;
}

type FetchRelationEntityOptionPage = (query: RelationEntityOptionQuery) => Promise<RelationEntityOptionPage>;

export type RelationDirection = 'From' | 'To';

export interface RelationEntityReference {
  id?: string;
  entityType?: string;
}

export interface RelationFormValues {
  from?: RelationEntityReference;
  to?: RelationEntityReference;
  type?: string;
  typeGroup?: unknown;
  additionalInfo?: unknown;
}

export function isRelationEntitySelectionRequired(relationDirection: RelationDirection, entitySide: RelationDirection) {
  return relationDirection !== entitySide;
}

export function buildRelationSaveData(
  formValues: RelationFormValues,
  openedRelation: RelationFormValues,
  direction: RelationDirection,
) {
  return {
    ...formValues,
    from: direction === 'From' ? openedRelation.from : formValues.from,
    to: direction === 'To' ? openedRelation.to : formValues.to,
  };
}

export function changeRelationEntityType(
  formValues: RelationFormValues,
  entitySide: RelationDirection,
  entityType: string,
) {
  const entityField = entitySide === 'From' ? 'from' : 'to';
  return {
    ...formValues,
    [entityField]: {
      ...(formValues[entityField] || {}),
      entityType,
      id: undefined,
    },
  };
}

function mergeOptions(...groups: RelationEntityOption[][]) {
  const byId = new Map<string, RelationEntityOption>();
  groups.flat().forEach((option) => {
    if (option?.value && !byId.has(option.value)) byId.set(option.value, option);
  });
  return Array.from(byId.values());
}

export function createRelationEntityOptionSource(fetchPage: FetchRelationEntityOptionPage, pageSize = 50) {
  const state = reactive<RelationEntityOptionState>({
    entityType: undefined,
    textSearch: '',
    options: [],
    selectedOption: null,
    nextPage: 0,
    hasNext: false,
    totalElements: 0,
    loading: false,
  });
  let generation = 0;

  async function loadNext() {
    if (!state.entityType || state.loading || !state.hasNext) return;
    const requestGeneration = generation;
    const requestedPage = state.nextPage;
    const requestedType = state.entityType;
    const requestedSearch = state.textSearch;
    state.loading = true;
    try {
      const result = await fetchPage({
        entityType: requestedType,
        page: requestedPage,
        pageSize,
        textSearch: requestedSearch,
      });
      if (requestGeneration !== generation) return;
      state.options = mergeOptions(
        state.selectedOption ? [state.selectedOption] : [],
        state.options,
        result.data || [],
      );
      state.nextPage = requestedPage + 1;
      state.hasNext = Boolean(result.hasNext);
      state.totalElements = Number(result.totalElements ?? state.options.length);
    } finally {
      if (requestGeneration === generation) state.loading = false;
    }
  }

  async function reset(entityType?: string, textSearch = '', selectedOption?: RelationEntityOption | null) {
    generation += 1;
    if (selectedOption !== undefined) state.selectedOption = selectedOption;
    state.entityType = entityType;
    state.textSearch = textSearch.trim();
    state.options = state.selectedOption ? [state.selectedOption] : [];
    state.nextPage = 0;
    state.hasNext = Boolean(entityType);
    state.totalElements = 0;
    state.loading = false;
    await loadNext();
  }

  function cancel() {
    generation += 1;
    state.loading = false;
  }

  return { state, reset, loadNext, cancel };
}

export function isRelationEntityDropdownNearBottom(
  target: Pick<HTMLElement, 'scrollTop' | 'clientHeight' | 'scrollHeight'>,
  threshold = 32,
) {
  return target.scrollTop + target.clientHeight >= target.scrollHeight - threshold;
}
