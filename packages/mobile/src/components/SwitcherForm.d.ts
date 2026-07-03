// Ambient type for the platform-split SwitcherForm so `tsc` resolves the
// extensionless `./SwitcherForm` import to this declaration, while Metro picks the
// matching SwitcherForm.ios.tsx / SwitcherForm.android.tsx at bundle time. Both
// implementations are still compiled and type-checked on their own. Mirrors the
// MoreForm.d.ts / FeatureFlagsForm.d.ts mechanism.

import type { FC } from 'react';
import type { SwitcherFormProps } from './SwitcherForm.types';

export declare const SwitcherForm: FC<SwitcherFormProps>;
