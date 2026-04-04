/**
 * 緩動函數集合
 * 用於 Ken Burns 運鏡和轉場動畫
 */

export function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t
}

export function easeIn(t: number): number {
  return t * t
}

export function easeOut(t: number): number {
  return t * (2 - t)
}

export function linear(t: number): number {
  return t
}

export type EasingName = 'easeInOut' | 'easeIn' | 'easeOut' | 'linear'

export const easingFunctions: Record<EasingName, (t: number) => number> = {
  easeInOut,
  easeIn,
  easeOut,
  linear,
}
