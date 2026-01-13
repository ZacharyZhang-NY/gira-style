export const LUX_EASE = [0.16, 1, 0.3, 1] as const;

export const LUX_DURATION = {
  micro: 0.18,
  base: 0.65,
  slow: 1.2,
  image: 1.8,
} as const;

export function luxTween(
  shouldReduceMotion: boolean | null | undefined,
  duration: number = LUX_DURATION.base,
) {
  if (shouldReduceMotion) return { duration: 0 };
  return { type: "tween" as const, duration, ease: LUX_EASE };
}
