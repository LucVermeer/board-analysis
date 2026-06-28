// Ambient type for the platform-split AngleSlider so `tsc` resolves the
// extensionless `./AngleSlider` import to this declaration, while Metro picks the
// matching AngleSlider.ios.tsx / AngleSlider.android.tsx at bundle time. Both
// implementations are still compiled and type-checked on their own. Mirrors the
// SwitchRow.d.ts mechanism.

import type { FC } from 'react';
import type { AngleSliderProps } from './AngleSlider.types';

export declare const AngleSlider: FC<AngleSliderProps>;
