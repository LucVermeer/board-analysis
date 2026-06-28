// Shared props for the platform-split AngleSlider. The implementation is split
// across AngleSlider.ios.tsx (native @expo/ui SwiftUI Slider) and
// AngleSlider.android.tsx (native @expo/ui Jetpack Compose Slider). The split
// keeps each platform's @expo/ui native tree — which resolves native views at
// module load — off the other platform's bundle. The public API is identical to
// the previous gesture-handler + reanimated custom slider, so every call site
// (AngleSelectorSheet, BoardForm) is unchanged.

export type AngleSliderProps = {
  /**
   * The evenly-spaced angle STOPS, in order. The underlying values may be
   * non-uniform (MoonBoard `[25, 40]`) or uniform (Kilter's 5° steps); the
   * slider maps to the INDEX domain so every stop gets an even slot regardless.
   */
  angles: number[];
  /** The currently selected angle. Must be one of `angles` (else the slider falls back to the first stop). */
  value: number;
  /**
   * Preview callback — fires frequently while dragging as the thumb snaps to a
   * new angle. NOT a commit; the parent commits separately (e.g. on release or
   * a confirm button). Always receives a real angle from `angles`.
   */
  onChange: (angle: number) => void;
};
