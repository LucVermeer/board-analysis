// Ambient type for the platform-split Stepper so `tsc` resolves the extensionless
// `./Stepper` import to this declaration, while Metro picks the matching
// Stepper.ios.tsx / Stepper.android.tsx at bundle time. Both implementations are
// still compiled and type-checked on their own. Mirrors SwitchRow.d.ts.

import type { FC } from 'react';
import type { StepperProps } from './Stepper.types';

export declare const Stepper: FC<StepperProps>;
