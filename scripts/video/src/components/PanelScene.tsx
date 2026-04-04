import React from 'react'
import { AbsoluteFill, Sequence } from 'remotion'
import { KenBurnsImage, type KenBurnsConfig } from './KenBurnsImage'
import { SubtitleOverlay, type SubtitleConfig } from './SubtitleOverlay'
import { TransitionEffect, type TransitionConfig } from './TransitionEffect'

export interface PanelConfig {
  panelNumber: number
  imagePath: string
  durationSec: number
  transition: TransitionConfig
  kenBurns: KenBurnsConfig
  subtitles: SubtitleConfig[]
}

interface PanelSceneProps {
  panel: PanelConfig
  startFrame: number
  fps: number
  width: number
  height: number
}

export const PanelScene: React.FC<PanelSceneProps> = ({
  panel,
  startFrame,
  fps,
  width,
  height,
}) => {
  const durationInFrames = Math.round(panel.durationSec * fps)
  const transitionFrames = Math.round((panel.transition?.durationSec ?? 0) * fps)

  return (
    <Sequence from={startFrame} durationInFrames={durationInFrames}>
      <AbsoluteFill>
        {/* Ken Burns 圖片動畫 */}
        <KenBurnsImage
          src={panel.imagePath}
          durationInFrames={durationInFrames}
          startFrame={0}
          kenBurns={panel.kenBurns}
          width={width}
          height={height}
        />

        {/* 字幕覆蓋層 */}
        <SubtitleOverlay
          subtitles={panel.subtitles}
          panelStartFrame={0}
          fps={fps}
          width={width}
          height={height}
        />

        {/* 轉場效果（格尾） */}
        {panel.transition && panel.transition.type !== 'none' && (
          <TransitionEffect
            transition={panel.transition}
            transitionStartFrame={durationInFrames - transitionFrames}
            fps={fps}
            width={width}
            height={height}
          />
        )}
      </AbsoluteFill>
    </Sequence>
  )
}
