import React from 'react'
import { Img, useCurrentFrame, interpolate } from 'remotion'
import { easingFunctions, type EasingName } from '../utils/easing'

export interface KenBurnsConfig {
  startScale: number
  endScale: number
  startPosition: { x: number; y: number }
  endPosition: { x: number; y: number }
  easing: EasingName
}

interface KenBurnsImageProps {
  src: string
  durationInFrames: number
  startFrame: number
  kenBurns: KenBurnsConfig
  width: number
  height: number
}

export const KenBurnsImage: React.FC<KenBurnsImageProps> = ({
  src,
  durationInFrames,
  startFrame,
  kenBurns,
  width,
  height,
}) => {
  const frame = useCurrentFrame()
  const relativeFrame = frame - startFrame
  const easingFn = easingFunctions[kenBurns.easing] ?? easingFunctions.easeInOut

  const progress = easingFn(
    interpolate(relativeFrame, [0, durationInFrames], [0, 1], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    })
  )

  const scale = interpolate(progress, [0, 1], [kenBurns.startScale, kenBurns.endScale])
  const translateX = interpolate(
    progress,
    [0, 1],
    [(kenBurns.startPosition.x - 0.5) * width, (kenBurns.endPosition.x - 0.5) * width]
  )
  const translateY = interpolate(
    progress,
    [0, 1],
    [(kenBurns.startPosition.y - 0.5) * height, (kenBurns.endPosition.y - 0.5) * height]
  )

  return (
    <div style={{ width, height, overflow: 'hidden', position: 'absolute', top: 0, left: 0 }}>
      <Img
        src={src}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          transform: `scale(${scale}) translate(${translateX}px, ${translateY}px)`,
          transformOrigin: 'center center',
        }}
      />
    </div>
  )
}
