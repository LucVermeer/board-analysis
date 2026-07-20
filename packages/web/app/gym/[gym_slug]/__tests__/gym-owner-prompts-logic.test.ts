import { describe, it, expect } from 'vite-plus/test';
import { ownerPromptsToShow } from '../gym-owner-prompts-logic';

describe('ownerPromptsToShow', () => {
  it('shows nothing to a non-editor, regardless of content', () => {
    expect(ownerPromptsToShow({ canEdit: false, hasBoards: false, hasKiosk: false, hasBranding: false })).toEqual([]);
    expect(ownerPromptsToShow({ canEdit: false, hasBoards: true, hasKiosk: true, hasBranding: true })).toEqual([]);
  });

  it('shows every prompt to an editor whose gym has no boards, kiosk, or branding', () => {
    expect(ownerPromptsToShow({ canEdit: true, hasBoards: false, hasKiosk: false, hasBranding: false })).toEqual([
      'boards',
      'kiosk',
      'branding',
    ]);
  });

  it('shows nothing to an editor whose gym is fully set up', () => {
    expect(ownerPromptsToShow({ canEdit: true, hasBoards: true, hasKiosk: true, hasBranding: true })).toEqual([]);
  });

  it('shows only the prompts for the missing pieces', () => {
    expect(ownerPromptsToShow({ canEdit: true, hasBoards: true, hasKiosk: false, hasBranding: true })).toEqual([
      'kiosk',
    ]);
    expect(ownerPromptsToShow({ canEdit: true, hasBoards: false, hasKiosk: true, hasBranding: false })).toEqual([
      'boards',
      'branding',
    ]);
  });
});
