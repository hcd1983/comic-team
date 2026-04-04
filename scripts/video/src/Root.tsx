import React from 'react'
import { Composition } from 'remotion'
import { ComicVideo, type VideoConfig } from './ComicVideo'
import { calculateTotalFrames } from './utils/timing'

/**
 * Remotion 入口
 * 透過 inputProps 接收 video-config.json 的內容
 */
export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="ComicVideo"
        component={ComicVideo as React.FC<Record<string, unknown>>}
        durationInFrames={900}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{
          config: {
            title: 'Preview',
            format: 'short-video',
            resolution: { width: 1080, height: 1920 },
            fps: 30,
            totalDurationSec: 30,
            panels: [],
            endCard: {
              durationSec: 3,
              text: 'Preview',
              subtext: 'AI 漫畫短片',
              bgColor: '#1a1a2e',
            },
          } satisfies VideoConfig,
        }}
        calculateMetadata={({ props }) => {
          const config = (props as { config: VideoConfig }).config
          const totalFrames = calculateTotalFrames(
            config.panels,
            config.fps,
            config.endCard.durationSec
          )
          return {
            durationInFrames: totalFrames || 900,
            fps: config.fps || 30,
            width: config.resolution?.width || 1080,
            height: config.resolution?.height || 1920,
          }
        }}
      />
    </>
  )
}
