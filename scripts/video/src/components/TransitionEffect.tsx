import React from 'react'
import { useCurrentFrame, interpolate } from 'remotion'

export interface TransitionConfig {
  type: 'fade' | 'slide-left' | 'slide-up' | 'zoom' | 'none'
  durationSec: number
}

interface TransitionEffectProps {
  transition: TransitionConfig
  transitionStartFrame: number
  fps: number
  width: number
  height: number
}

/**
 * 在格與格之間的轉場效果
 * 覆蓋在當前格畫面之上
 */
export const TransitionEffect: React.FC<TransitionEffectProps> = ({
  transition,
  transitionStartFrame,
  fps,
  width,
  height,
}) => {
  const frame = useCurrentFrame()
  const transitionFrames = Math.round(transition.durationSec * fps)
  const transitionEndFrame = transitionStartFrame + transitionFrames

  if (transition.type === 'none') return null
  if (frame < transitionStartFrame || frame > transitionEndFrame) return null

  const progress = interpolate(
    frame,
    [transitionStartFrame, transitionEndFrame],
    [0, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  )

  switch (transition.type) {
    case 'fade':
      return (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width,
            height,
            backgroundColor: 'black',
            opacity: progress,
          }}
        />
      )

    case 'slide-left':
      return (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width,
            height,
            backgroundColor: 'black',
            transform: `translateX(${(1 - progress) * 100}%)`,
          }}
        />
      )

    case 'slide-up':
      return (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width,
            height,
            backgroundColor: 'black',
            transform: `translateY(${(1 - progress) * -100}%)`,
          }}
        />
      )

    case 'zoom':
      return (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width,
            height,
            backgroundColor: 'black',
            opacity: progress,
            transform: `scale(${1 + (1 - progress) * 0.3})`,
            transformOrigin: 'center center',
          }}
        />
      )

    default:
      return null
  }
}
