/**
 * Empty route: the Record tab opens the session overlay (mounted at the root
 * layout) rather than navigating here. `<BlurTabBar>` intercepts the press
 * and calls `useSessionScreen().toggle()` — this component would only render
 * if someone deep-linked to `/record`, in which case staying blank is fine.
 */
export default function RecordIndex() {
  return null;
}
