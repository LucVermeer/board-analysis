import { parseQueryParamBoolean, parseQueryParamInt } from '@/app/lib/url-utils';
import {
  DEFAULT_ANGLE_RANGE,
  DEFAULT_FILTERS,
  DEFAULT_SORT,
  type LogbookFilterState,
  type LogbookSortState,
  type SortField,
} from '@/app/lib/logbook-preferences';

const VALID_SORT_FIELDS = new Set<SortField>(['climbName', 'loggedGrade', 'consensusGrade', 'date', 'attemptCount']);

function isValidSortField(value: string): value is SortField {
  return VALID_SORT_FIELDS.has(value as SortField);
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isIsoDate(value: string | null): value is string {
  if (!value || !ISO_DATE_RE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return false;
  // Round-trip check catches values Date silently coerces (e.g. '2024-13-40'
  // would become '2025-02-09' on some runtimes, or NaN on others).
  return parsed.toISOString().slice(0, 10) === value;
}

export function readFiltersFromQuery(params: URLSearchParams): Partial<LogbookFilterState> {
  const partial: Partial<LogbookFilterState> = {};

  const sends = parseQueryParamBoolean(params, 'sends');
  if (sends !== undefined) partial.includeSends = sends;

  const attempts = parseQueryParamBoolean(params, 'attempts');
  if (attempts !== undefined) partial.includeAttempts = attempts;

  const flash = parseQueryParamBoolean(params, 'flash');
  if (flash !== undefined) partial.flashOnly = flash;

  const benchmark = parseQueryParamBoolean(params, 'benchmark');
  if (benchmark !== undefined) partial.benchmarkOnly = benchmark;

  const minGrade = parseQueryParamInt(params, 'minGrade');
  if (minGrade !== undefined) partial.minGrade = minGrade;

  const maxGrade = parseQueryParamInt(params, 'maxGrade');
  if (maxGrade !== undefined) partial.maxGrade = maxGrade;

  const from = params.get('from');
  if (isIsoDate(from)) partial.fromDate = from;

  const to = params.get('to');
  if (isIsoDate(to)) partial.toDate = to;

  const minAngle = parseQueryParamInt(params, 'minAngle');
  const maxAngle = parseQueryParamInt(params, 'maxAngle');
  if (minAngle !== undefined || maxAngle !== undefined) {
    partial.angleRange = [minAngle ?? DEFAULT_ANGLE_RANGE[0], maxAngle ?? DEFAULT_ANGLE_RANGE[1]];
  }

  return partial;
}

export function readSortFromQuery(params: URLSearchParams): Partial<LogbookSortState> {
  const partial: Partial<LogbookSortState> = {};
  const sort = params.get('sort');
  if (sort && isValidSortField(sort)) {
    partial.mode = 'custom';
    partial.primaryField = sort;
  }
  const order = params.get('order');
  if (order === 'asc' || order === 'desc') {
    // Apply direction when the sort field was parsed above OR when 'sort'
    // was absent and we fall back to the default field in custom mode. The
    // only case we skip is an invalid 'sort' value (present but rejected),
    // to avoid fabricating a field the user did not ask for.
    if (partial.primaryField || !sort) {
      if (!partial.primaryField) {
        partial.mode = 'custom';
        partial.primaryField = DEFAULT_SORT.primaryField;
      }
      partial.primaryDirection = order;
    }
  }
  const sort2 = params.get('sort2');
  if (sort2 && isValidSortField(sort2)) partial.secondaryField = sort2;
  const order2 = params.get('order2');
  if (order2 === 'asc' || order2 === 'desc') partial.secondaryDirection = order2;
  return partial;
}

export function filtersToQueryParams(
  searchText: string,
  filters: LogbookFilterState,
  sortState: LogbookSortState,
  selectedBoardUuids: string[],
): Record<string, string> {
  const params: Record<string, string> = {};

  if (searchText) params.q = searchText;
  if (selectedBoardUuids.length > 0) params.boards = selectedBoardUuids.join(',');
  if (filters.minGrade !== '' && filters.minGrade !== undefined) params.minGrade = String(filters.minGrade);
  if (filters.maxGrade !== '' && filters.maxGrade !== undefined) params.maxGrade = String(filters.maxGrade);

  // Only write non-default filter values. The status resting state is sends-only
  // (DEFAULT_FILTERS), so a status param is emitted only when it differs from that
  // default — the real boolean value, so the URL round-trips. A clean default
  // logbook view therefore yields no status params (matters for the canonical URL).
  if (filters.includeSends !== DEFAULT_FILTERS.includeSends) params.sends = filters.includeSends ? '1' : '0';
  if (filters.includeAttempts !== DEFAULT_FILTERS.includeAttempts)
    params.attempts = filters.includeAttempts ? '1' : '0';
  if (filters.flashOnly) params.flash = '1';
  if (filters.benchmarkOnly) params.benchmark = '1';
  if (filters.fromDate) params.from = filters.fromDate;
  if (filters.toDate) params.to = filters.toDate;
  if (filters.angleRange[0] !== DEFAULT_ANGLE_RANGE[0]) params.minAngle = String(filters.angleRange[0]);
  if (filters.angleRange[1] !== DEFAULT_ANGLE_RANGE[1]) params.maxAngle = String(filters.angleRange[1]);

  if (sortState.mode === 'custom') {
    // Always emit the sort field so direction-only URLs don't occur
    params.sort = sortState.primaryField;
    if (sortState.primaryDirection !== DEFAULT_SORT.primaryDirection) params.order = sortState.primaryDirection;
    if (sortState.secondaryField) params.sort2 = sortState.secondaryField;
    if (sortState.secondaryField && sortState.secondaryDirection !== 'desc')
      params.order2 = sortState.secondaryDirection;
  }

  return params;
}
