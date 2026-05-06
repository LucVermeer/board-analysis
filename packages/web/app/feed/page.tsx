import { permanentRedirect } from 'next/navigation';

type FeedProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

// /feed has been folded into /you as a sub-tab. Preserve old links via 308.
export default async function FeedPage({ searchParams }: FeedProps) {
  const params = await searchParams;
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string') qs.set(key, value);
    else if (Array.isArray(value)) for (const v of value) qs.append(key, v);
  }
  const target = qs.toString() ? `/you/feed?${qs.toString()}` : '/you/feed';
  permanentRedirect(target);
}
