import 'server-only';

import { track as vercelTrack } from '@vercel/analytics/server';

export const track: typeof vercelTrack = (eventName, properties, options) => {
  return vercelTrack(eventName, properties, options);
};
