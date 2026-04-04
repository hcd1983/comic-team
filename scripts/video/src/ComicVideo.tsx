import React from 'react'
import { AbsoluteFill } from 'remotion'
import { PanelScene, type PanelConfig } from './components/PanelScene'
import { EndCard, type EndCardConfig } from './components/EndCard'
import { calculateTimeline } from './utils/timing'

export interface VideoConfig {
  title: string
  format: string
  resolution: { width: number; height: number }
  fps: number
  totalDurationSec: number
  panels: PanelConfig[]
  endCard: EndCardConfig
}

export const ComicVideo: React.FC<{ config: VideoConfig }> = ({ config }) => {
  const { resolution, fps, panels, endCard } = config
  const { width, height } = resolution

  const timeline = calculateTimeline(panels, fps, endCard.durationSec)

  // 計算片尾卡起始幀
  const lastPanel = timeline[timeline.length - 1]
  const endCardStartFrame = lastPanel ? lastPanel.endFrame : 0

  return (
    <AbsoluteFill style={{ backgroundColor: 'black' }}>
      {/* 各格場景 */}
      {panels.map((panel, index) => (
        <PanelScene
          key={panel.panelNumber}
          panel={panel}
          startFrame={timeline[index].startFrame}
          fps={fps}
          width={width}
          height={height}
        />
      ))}

      {/* 片尾卡 */}
      <EndCard
        config={endCard}
        startFrame={endCardStartFrame}
        fps={fps}
        width={width}
        height={height}
      />
    </AbsoluteFill>
  )
}
