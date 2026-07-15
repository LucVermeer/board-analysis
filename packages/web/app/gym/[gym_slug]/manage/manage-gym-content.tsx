'use client';

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Container from '@mui/material/Container';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import MuiLink from '@mui/material/Link';
import ArrowBackOutlined from '@mui/icons-material/ArrowBackOutlined';
import type { Gym } from '@boardsesh/shared-schema';
import LocaleLink from '@/app/components/i18n/locale-link';
import { useLocaleRouter, usePathnameWithoutLocale } from '@/app/lib/i18n/use-locale-router';
import { themeTokens } from '@/app/theme/theme-config';
import GymMemberManagement from '@/app/components/gym-entity/gym-member-management';
import GymBoardsTab from '@/app/components/gym-entity/manage/gym-boards-tab';
import KiosksTab from '@/app/components/gym-entity/manage/kiosks-tab';
import BrandingTab from '@/app/components/gym-entity/manage/branding-tab';
import GymSlugGuard from '@/app/components/gym-entity/manage/gym-slug-guard';

type ManageTab = 'kiosks' | 'branding' | 'boards' | 'members';
const VALID_TABS: ManageTab[] = ['kiosks', 'branding', 'boards', 'members'];
const DEFAULT_TAB: ManageTab = 'kiosks';

export default function ManageGymContent({ initialGym }: { initialGym: Gym }) {
  const { t } = useTranslation('kiosk');
  const [gym, setGym] = useState<Gym>(initialGym);
  const searchParams = useSearchParams();
  const router = useLocaleRouter();
  const basePath = usePathnameWithoutLocale();
  const { data: session } = useSession();

  const currentUserId = session?.user?.id ?? null;
  const isOwnerOrAdmin = (!!currentUserId && gym.ownerId === currentUserId) || gym.myRole === 'admin';

  const tabParam = searchParams.get('tab');
  const activeTab: ManageTab = VALID_TABS.includes(tabParam as ManageTab) ? (tabParam as ManageTab) : DEFAULT_TAB;

  const handleTabChange = (_event: React.SyntheticEvent, value: ManageTab) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value === DEFAULT_TAB) {
      params.delete('tab');
    } else {
      params.set('tab', value);
    }
    const query = params.toString();
    router.push(query ? `${basePath}?${query}` : basePath, { scroll: false });
  };

  const handleSlugSet = (updatedGym: Gym) => {
    setGym(updatedGym);
    // Move to the canonical slug URL so kiosk/public links resolve from here on.
    const query = activeTab === DEFAULT_TAB ? '' : `?tab=${activeTab}`;
    router.replace(`/gym/${updatedGym.slug}/manage${query}`, { scroll: false });
  };

  return (
    <Container maxWidth="md" sx={{ py: 4, pt: 'calc(var(--global-header-height) + 32px)' }}>
      {gym.slug && (
        <Box sx={{ mb: 1.5 }}>
          <MuiLink
            component={LocaleLink}
            href={`/gym/${gym.slug}`}
            underline="hover"
            sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, color: themeTokens.colors.primary }}
          >
            <ArrowBackOutlined sx={{ fontSize: 16 }} />
            {t('manage.backToGym')}
          </MuiLink>
        </Box>
      )}

      <Typography variant="h4" component="h1" sx={{ fontWeight: themeTokens.typography.fontWeight.bold, mb: 3 }}>
        {t('manage.title', { gymName: gym.name })}
      </Typography>

      {!gym.slug && <GymSlugGuard gym={gym} onSlugSet={handleSlugSet} />}

      <Tabs
        value={activeTab}
        onChange={handleTabChange}
        variant="scrollable"
        scrollButtons="auto"
        sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}
      >
        <Tab value="kiosks" label={t('manage.tabs.kiosks')} sx={{ textTransform: 'none' }} />
        <Tab value="branding" label={t('manage.tabs.branding')} sx={{ textTransform: 'none' }} />
        <Tab value="boards" label={t('manage.tabs.boards')} sx={{ textTransform: 'none' }} />
        <Tab value="members" label={t('manage.tabs.members')} sx={{ textTransform: 'none' }} />
      </Tabs>

      {activeTab === 'kiosks' && <KiosksTab gym={gym} onGymChange={setGym} />}
      {activeTab === 'branding' && <BrandingTab gym={gym} onGymChange={setGym} />}
      {activeTab === 'boards' && <GymBoardsTab gym={gym} onGymChange={setGym} />}
      {activeTab === 'members' && (
        <GymMemberManagement
          gymUuid={gym.uuid}
          isOwnerOrAdmin={isOwnerOrAdmin}
          canGrantAccess={gym.canGrantAccess ?? false}
        />
      )}
    </Container>
  );
}
