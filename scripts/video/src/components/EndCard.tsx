import React from 'react'
import { useCurrentFrame, interpolate } from 'remotion'

export interface EndCardConfig {
  durationSec: number
  text: string
  subtext?: string
  bgColor: string
}

interface EndCardProps {
  config: EndCardConfig
  startFrame: number
  fps: number
  width: number
  height: number
}

export const EndCard: React.FC<EndCardProps> = ({
  config,
  startFrame,
  fps,
  width,
  height,
}) => {
  const frame = useCurrentFrame()
  const relativeFrame = frame - startFrame
  const totalFrames = Math.round(config.durationSec * fps)

  if (relativeFrame < 0 || relativeFrame > totalFrames) return null

  const fadeIn = interpolate(relativeFrame, [0, Math.round(fps * 0.5)], [0, 1], {
    extrapolateRight: 'clamp',
  })

  const titleScale = interpolate(
    relativeFrame,
    [0, Math.round(fps * 0.6)],
    [0.8, 1],
    { extrapolateRight: 'clamp' }
  )

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width,
        height,
        backgroundColor: config.bgColor,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: fadeIn,
      }}
    >
      <div
        style={{
          fontSize: 48,
          fontFamily: 'Noto Sans TC, sans-serif',
          fontWeight: 700,
          color: '#FFFFFF',
          transform: `scale(${titleScale})`,
          marginBottom: 16,
        }}
      >
        {config.text}
      </div>
      {config.subtext && (
        <div
          style={{
            fontSize: 24,
            fontFamily: 'Noto Sans TC, sans-serif',
            color: '#AAAAAA',
            opacity: interpolate(
              relativeFrame,
              [Math.round(fps * 0.3), Math.round(fps * 0.7)],
              [0, 1],
              { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
            ),
          }}
        >
          {config.subtext}
        </div>
      )}
    </div>
  )
}
