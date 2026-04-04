import React from 'react'
import { useCurrentFrame, interpolate } from 'remotion'

export interface SubtitleConfig {
  text: string
  startSec: number
  endSec: number
  style: {
    fontSize: number
    fontFamily: string
    color: string
    strokeColor: string
    strokeWidth: number
    position: 'top' | 'center' | 'bottom'
    animation: 'fadeIn' | 'typewriter' | 'slideUp'
  }
}

interface SubtitleOverlayProps {
  subtitles: SubtitleConfig[]
  panelStartFrame: number
  fps: number
  width: number
  height: number
}

export const SubtitleOverlay: React.FC<SubtitleOverlayProps> = ({
  subtitles,
  panelStartFrame,
  fps,
  width,
  height,
}) => {
  const frame = useCurrentFrame()

  return (
    <>
      {subtitles.map((subtitle, index) => {
        const startFrame = panelStartFrame + Math.round(subtitle.startSec * fps)
        const endFrame = panelStartFrame + Math.round(subtitle.endSec * fps)

        if (frame < startFrame || frame > endFrame) return null

        const relativeFrame = frame - startFrame
        const totalFrames = endFrame - startFrame

        const positionStyle: React.CSSProperties = {
          top: subtitle.style.position === 'top' ? '10%' : undefined,
          bottom: subtitle.style.position === 'bottom' ? '8%' : subtitle.style.position === 'center' ? undefined : undefined,
          top: subtitle.style.position === 'center' ? '45%' : undefined,
        }

        let opacity = 1
        let translateY = 0
        let displayText = subtitle.text

        switch (subtitle.style.animation) {
          case 'fadeIn': {
            const fadeFrames = Math.min(Math.round(fps * 0.3), totalFrames)
            opacity = interpolate(relativeFrame, [0, fadeFrames], [0, 1], {
              extrapolateRight: 'clamp',
            })
            break
          }
          case 'slideUp': {
            const slideFrames = Math.min(Math.round(fps * 0.4), totalFrames)
            opacity = interpolate(relativeFrame, [0, slideFrames], [0, 1], {
              extrapolateRight: 'clamp',
            })
            translateY = interpolate(relativeFrame, [0, slideFrames], [30, 0], {
              extrapolateRight: 'clamp',
            })
            break
          }
          case 'typewriter': {
            const charsPerFrame = subtitle.text.length / (totalFrames * 0.7)
            const visibleChars = Math.min(
              Math.floor(relativeFrame * charsPerFrame),
              subtitle.text.length
            )
            displayText = subtitle.text.slice(0, visibleChars)
            break
          }
        }

        return (
          <div
            key={index}
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              ...positionStyle,
              display: 'flex',
              justifyContent: 'center',
              opacity,
              transform: `translateY(${translateY}px)`,
            }}
          >
            <span
              style={{
                fontSize: subtitle.style.fontSize,
                fontFamily: subtitle.style.fontFamily,
                color: subtitle.style.color,
                WebkitTextStroke: `${subtitle.style.strokeWidth}px ${subtitle.style.strokeColor}`,
                paintOrder: 'stroke fill',
                textAlign: 'center',
                padding: '4px 16px',
                maxWidth: width * 0.9,
                lineHeight: 1.4,
              }}
            >
              {displayText}
            </span>
          </div>
        )
      })}
    </>
  )
}
