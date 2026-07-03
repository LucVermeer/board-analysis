import { describe, it, expect, beforeEach } from 'vitest';
import { getAnalyticsBootstrapId, setAnalyticsBootstrapId } from '../analytics-bootstrap-id';

describe('analytics-bootstrap-id', () => {
  beforeEach(() => {
    setAnalyticsBootstrapId(null);
  });

  it('defaults to null before anything sets it', () => {
    expect(getAnalyticsBootstrapId()).toBeNull();
  });

  it('round-trips whatever id was set', () => {
    setAnalyticsBootstrapId('party-profile-uuid');
    expect(getAnalyticsBootstrapId()).toBe('party-profile-uuid');
  });

  it('can be reset back to null', () => {
    setAnalyticsBootstrapId('party-profile-uuid');
    setAnalyticsBootstrapId(null);
    expect(getAnalyticsBootstrapId()).toBeNull();
  });
});
