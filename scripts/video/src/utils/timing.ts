/**
 * 時間軸計算工具
 */

export interface PanelTiming {
  panelNumber: number
  startFrame: number
  endFrame: number
  durationFrames: number
  transitionStartFrame: number
  transitionEndFrame: number
}

/**
 * 根據 video-config.json 計算每格的精確幀時間軸
 */
export function calculateTimeline(
  panels: Array<{ durationSec: number; transition?: { durationSec: number } }>,
  fps: number,
  endCardDurationSec: number
): PanelTiming[] {
  const timeline: PanelTiming[] = []
  let currentFrame = 0

  for (let i = 0; i < panels.length; i++) {
    const panel = panels[i]
    const durationFrames = Math.round(panel.durationSec * fps)
    const transitionDuration = panel.transition?.durationSec ?? 0
    const transitionFrames = Math.round(transitionDuration * fps)

    timeline.push({
      panelNumber: i + 1,
      startFrame: currentFrame,
      endFrame: currentFrame + durationFrames,
      durationFrames,
      transitionStartFrame: currentFrame + durationFrames - transitionFrames,
      transitionEndFrame: currentFrame + durationFrames,
    })

    currentFrame += durationFrames
  }

  return timeline
}

/**
 * 計算影片總幀數
 */
export function calculateTotalFrames(
  panels: Array<{ durationSec: number }>,
  fps: number,
  endCardDurationSec: number
): number {
  const panelFrames = panels.reduce(
    (sum, p) => sum + Math.round(p.durationSec * fps),
    0
  )
  const endCardFrames = Math.round(endCardDurationSec * fps)
  return panelFrames + endCardFrames
}
