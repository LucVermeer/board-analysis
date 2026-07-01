// Ambient type so `tsc` resolves the extensionless `./LogbookChipRow` import
// while Metro picks the .ios/.android implementation at bundle time.

import type { FC } from 'react';
import type { LogbookChipRowProps } from './LogbookChipRow.types';

export declare const LogbookChipRow: FC<LogbookChipRowProps>;
