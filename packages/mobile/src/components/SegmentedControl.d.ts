// Ambient type for the platform-split SegmentedControl so `tsc` resolves the
// extensionless `./SegmentedControl` import to this declaration, while Metro picks
// the matching SegmentedControl.ios.tsx / SegmentedControl.android.tsx at bundle
// time. Both implementations are still compiled and type-checked on their own.
// Mirrors the SwitchRow.d.ts mechanism, but declared as a generic function so the
// `<K extends string>` option-key type flows through at every call site.

import type { JSX } from 'react';
import type { SegmentedControlProps } from './SegmentedControl.types';

export declare function SegmentedControl<K extends string = string>(props: SegmentedControlProps<K>): JSX.Element;
