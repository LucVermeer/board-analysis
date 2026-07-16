import { describe, expect, it } from 'vitest';
import { decideManageNavigation, type ManageNavigation } from '../manage-nav-guard';

const tabNavigation: ManageNavigation = { kind: 'tab', tab: 'branding' };
const hrefNavigation: ManageNavigation = { kind: 'href', href: '/gym/crux-house' };

describe('decideManageNavigation', () => {
  it('proceeds immediately when the active tab is clean', () => {
    expect(decideManageNavigation(false, tabNavigation)).toEqual({ action: 'proceed', navigation: tabNavigation });
    expect(decideManageNavigation(false, hrefNavigation)).toEqual({ action: 'proceed', navigation: hrefNavigation });
  });

  it('holds tab switches behind the confirm while dirty', () => {
    expect(decideManageNavigation(true, tabNavigation)).toEqual({ action: 'confirm', pending: tabNavigation });
  });

  it('holds the back-to-gym link behind the confirm while dirty', () => {
    expect(decideManageNavigation(true, hrefNavigation)).toEqual({ action: 'confirm', pending: hrefNavigation });
  });
});
