'use client';

import React, { useState } from 'react';
import Autocomplete from '@mui/material/Autocomplete';
import TextField from '@mui/material/TextField';
import CircularProgress from '@mui/material/CircularProgress';
import { useTranslation } from 'react-i18next';
import { useUISearchParams } from '../queue-control/ui-searchparams-provider';
import { useSearchData } from '../graphql-queue';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { constructSetterStatsUrl } from '@/app/lib/url-utils';

type SetterStat = {
  setter_username: string;
  climb_count: number;
};

type SetterOption = {
  value: string;
  label: string;
  count: number;
};

// Throws on a non-2xx response instead of silently resolving the error body
// (e.g. `{ error: "..." }` from the setters API route) as if it were data.
// Without this, a transient API failure hands the query an object where an
// array was expected, which crashed `.map` downstream (issue #2068 /
// Sentry BOARDSESH-7C). This message is never rendered — it only surfaces
// via React Query's `error` state / console — so it doesn't need i18n.
const fetcher = (url: string) =>
  fetch(url).then((res) => {
    if (!res.ok) {
      throw new Error('Failed to fetch setter stats');
    }
    return res.json();
  });

const MIN_SEARCH_LENGTH = 2; // Only search when user has typed at least 2 characters

const SetterNameSelect = () => {
  const { t } = useTranslation('climbs');
  const { uiSearchParams, updateFilters } = useUISearchParams();
  const { parsedParams } = useSearchData();
  const [searchValue, setSearchValue] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  // Fetch top setters when dropdown is open OR when user is searching
  const shouldFetch = isOpen || searchValue.length >= MIN_SEARCH_LENGTH;
  const isSearching = searchValue.length >= MIN_SEARCH_LENGTH;

  // Build API URL - with search query if searching, without if just showing top setters
  const apiUrl = shouldFetch ? constructSetterStatsUrl(parsedParams, isSearching ? searchValue : undefined) : null;

  // Fetch setter stats from the API
  const { data: setterStats, isLoading } = useQuery<SetterStat[]>({
    queryKey: ['setterStats', apiUrl],
    queryFn: () => fetcher(apiUrl!),
    enabled: !!apiUrl,
    staleTime: 5 * 60 * 1000,
    placeholderData: keepPreviousData,
  });

  // Map setter stats to Autocomplete options. Guards against any non-array
  // shape reaching here (e.g. a future API response drift), not just the
  // undefined-while-loading case — see the fetcher comment above.
  const options: SetterOption[] = React.useMemo(() => {
    if (!Array.isArray(setterStats)) return [];

    return setterStats.map((stat) => ({
      value: stat.setter_username,
      label: `${stat.setter_username} (${stat.climb_count})`,
      count: stat.climb_count,
    }));
  }, [setterStats]);

  // Convert selected values (string[]) to option objects for Autocomplete
  const selectedOptions: SetterOption[] = React.useMemo(() => {
    return (uiSearchParams.settername || []).map((name) => {
      const found = options.find((o) => o.value === name);
      return found || { value: name, label: name, count: 0 };
    });
  }, [uiSearchParams.settername, options]);

  let noOptionsText: string;
  if (isLoading) {
    noOptionsText = t('common:actions.loading');
  } else if (!isOpen && searchValue.length === 0) {
    noOptionsText = t('search.fields.setterPromptOpen');
  } else {
    noOptionsText = t('search.fields.setterNoResults');
  }

  return (
    <Autocomplete
      multiple
      open={isOpen}
      onOpen={() => setIsOpen(true)}
      onClose={() => setIsOpen(false)}
      options={options}
      value={selectedOptions}
      onChange={(_, newValue) => updateFilters({ settername: newValue.map((v) => v.value) })}
      onInputChange={(_, value, reason) => {
        if (reason !== 'reset') {
          setSearchValue(value);
        }
      }}
      inputValue={searchValue}
      getOptionLabel={(option) => option.label}
      isOptionEqualToValue={(option, value) => option.value === value.value}
      filterOptions={(x) => x} // Server-side filtering
      loading={isLoading}
      limitTags={2}
      noOptionsText={noOptionsText}
      sx={{ width: '100%' }}
      size="small"
      renderInput={(params) => (
        <TextField
          {...params}
          placeholder={selectedOptions.length === 0 ? t('search.placeholders.setters') : ''}
          slotProps={{
            input: {
              ...params.InputProps,
              endAdornment: (
                <>
                  {isLoading ? <CircularProgress color="inherit" size={16} /> : null}
                  {params.InputProps.endAdornment}
                </>
              ),
            },
          }}
        />
      )}
    />
  );
};

export default SetterNameSelect;
