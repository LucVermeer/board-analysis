import { createVariantComponent } from '../../theme/variants/create-variant-component';
import { IpadSidebar } from './IpadSidebar';
import { MaterialNavigationRail } from './MaterialNavigationRail';

/**
 * The tablet adaptive-shell sidebar, routed by UI variant: the Liquid Glass rail
 * (`IpadSidebar`) on iOS/glass, the Material 3 navigation rail
 * (`MaterialNavigationRail`) on Android/Material. Both expose the same
 * `{ showWallCell }` prop API, so `_layout.tsx` renders one component and each
 * platform/variant gets its native chrome. See `theme/variants/README.md` for the
 * routing rule (whole-subtree swap → `createVariantComponent`).
 */
export const TabletSidebar = createVariantComponent('TabletSidebar', {
  liquidGlass: IpadSidebar,
  material: MaterialNavigationRail,
});
