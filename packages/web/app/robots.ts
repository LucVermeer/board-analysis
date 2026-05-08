import type { MetadataRoute } from 'next';
import { absoluteUrl } from '@/app/lib/seo/base-url';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/feed', '/api/', '/auth/', '/settings', '/you', '/you/*'],
    },
    sitemap: absoluteUrl('/sitemap.xml'),
  };
}
