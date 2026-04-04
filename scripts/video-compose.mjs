#!/usr/bin/env node

/**
 * Video Compose MCP Server v2
 * 支援動畫影片拼接（Veo 3）+ 四層音軌混合 + 字幕燒入
 * 使用 stdio transport + JSON-RPC
 *
 * Tools:
 *   render_video   — 拼接動畫片段（或 Ken Burns 降級）為完整影片
 *   compose_final  — 四層音軌混合（環境音 + BGM + 旁白 + 角色語音）
 */

import { readFileSync, existsSync, mkdirSync, statSync } from 'fs'
import { dirname, resolve, join } from 'path'
import { stdin, stdout } from 'process'
import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

/**
 * 渲染影片：優先使用動畫片段拼接，降級為 Ken Burns
 */
async function renderVideo(configPath, outputPath) {
  const startTime = Date.now()

  if (!existsSync(configPath)) {
    throw new Error(`video-config.json 不存在：${configPath}`)
  }

  const config = JSON.parse(readFileSync(configPath, 'utf-8'))
  const dir = dirname(outputPath)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }

  // 檢查是否有動畫片段可用
  const hasAnimated = config.panels.some(
    (p) => p.animatedVideoPath && existsSync(p.animatedVideoPath)
  )

  if (hasAnimated) {
    await renderWithAnimatedClips(config, outputPath)
  } else {
    await renderWithFFmpegKenBurns(config, outputPath)
  }

  const stats = statSync(outputPath)

  return {
    success: true,
    path: outputPath,
    mode: hasAnimated ? 'animated' : 'ken-burns',
    durationSec: config.totalDurationSec + (config.endCard?.durationSec || 3),
    fileSizeMB: Math.round((stats.size / 1024 / 1024) * 100) / 100,
    processingMs: Date.now() - startTime,
  }
}

/**
 * 動畫片段拼接方案：Veo 3 動畫 + xfade 轉場 + 片尾卡
 */
async function renderWithAnimatedClips(config, outputPath) {
  const { panels, resolution, fps, endCard } = config
  const { width, height } = resolution
  const ffmpegPath = await getFFmpegPath()

  const inputs = []
  const filterParts = []
  let prevLabel = ''

  for (let i = 0; i < panels.length; i++) {
    const panel = panels[i]

    // 有動畫就用動畫，沒有就用 Ken Burns 降級
    if (panel.animatedVideoPath && existsSync(panel.animatedVideoPath)) {
      inputs.push('-i', panel.animatedVideoPath)
    } else if (panel.imagePath && existsSync(panel.imagePath)) {
      // 降級：靜態圖片 loop
      inputs.push('-loop', '1', '-t', String(panel.durationSec), '-i', panel.imagePath)
    } else {
      throw new Error(`格 ${i + 1}：找不到動畫或圖片檔案`)
    }

    // 統一縮放到目標解析度，去音軌（音軌由 compose_final 處理）
    filterParts.push(
      `[${i}:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${fps},trim=duration=${panel.durationSec},setpts=PTS-STARTPTS[v${i}]`
    )
  }

  // xfade 轉場：逐段串接
  let currentLabel = '[v0]'
  let offset = panels[0].durationSec

  for (let i = 1; i < panels.length; i++) {
    const transition = panels[i].transition || { type: 'fade', durationSec: 0.5 }
    const xfadeType = mapTransitionToXfade(transition.type)
    const duration = transition.durationSec || 0.5
    const outLabel = `[xf${i}]`

    filterParts.push(
      `${currentLabel}[v${i}]xfade=transition=${xfadeType}:duration=${duration}:offset=${offset - duration}${outLabel}`
    )

    currentLabel = outLabel
    offset += panels[i].durationSec - duration
  }

  // 片尾卡（黑底）
  const endCardDuration = endCard?.durationSec || 3
  const endCardIdx = panels.length
  inputs.push(
    '-f', 'lavfi', '-t', String(endCardDuration),
    '-i', `color=c=${(endCard?.bgColor || '#1a1a2e').replace('#', '0x')}:s=${width}x${height}:r=${fps}`
  )

  // 片尾卡接在最後，用 fade 轉場
  const endLabel = `[xfend]`
  filterParts.push(
    `${currentLabel}[${endCardIdx}:v]xfade=transition=fade:duration=1:offset=${offset - 1}${endLabel}`
  )

  const filterComplex = filterParts.join(';')

  const args = [
    ...inputs,
    '-filter_complex', filterComplex,
    '-map', endLabel,
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-crf', '23',
    '-pix_fmt', 'yuv420p',
    '-an', // 無音軌
    '-y',
    outputPath,
  ]

  await runFFmpeg(ffmpegPath, args)
}

/**
 * Ken Burns 降級方案（與之前相同）
 */
async function renderWithFFmpegKenBurns(config, outputPath) {
  const { panels, resolution, fps, endCard } = config
  const { width, height } = resolution

  const inputs = []
  const filterParts = []
  const concatInputs = []

  for (let i = 0; i < panels.length; i++) {
    const panel = panels[i]
    const imagePath = panel.imagePath
    if (!existsSync(imagePath)) {
      throw new Error(`圖片不存在：${imagePath}`)
    }

    const durationFrames = Math.round(panel.durationSec * fps)
    inputs.push('-loop', '1', '-t', String(panel.durationSec), '-i', imagePath)

    const kb = panel.kenBurns || { startScale: 1, endScale: 1.1 }
    const zoomExpr = `${kb.startScale}+(${kb.endScale}-${kb.startScale})*on/${durationFrames}`

    filterParts.push(
      `[${i}:v]scale=${width * 2}:${height * 2},zoompan=z='${zoomExpr}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${durationFrames}:s=${width}x${height}:fps=${fps},trim=duration=${panel.durationSec},setpts=PTS-STARTPTS,setsar=1[v${i}]`
    )
    concatInputs.push(`[v${i}]`)
  }

  const endCardDuration = endCard?.durationSec || 3
  const endCardIdx = panels.length
  inputs.push(
    '-f', 'lavfi', '-t', String(endCardDuration),
    '-i', `color=c=${(endCard?.bgColor || '#1a1a2e').replace('#', '0x')}:s=${width}x${height}:r=${fps}`
  )
  concatInputs.push(`[${endCardIdx}:v]`)

  const filterComplex = [
    ...filterParts,
    `${concatInputs.join('')}concat=n=${concatInputs.length}:v=1:a=0[outv]`,
  ].join(';')

  const ffmpegPath = await getFFmpegPath()
  const args = [
    ...inputs,
    '-filter_complex', filterComplex,
    '-map', '[outv]',
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-crf', '23',
    '-pix_fmt', 'yuv420p',
    '-y',
    outputPath,
  ]

  await runFFmpeg(ffmpegPath, args)
}

/**
 * 四層音軌合成：環境音（Veo 3）+ BGM + 旁白 TTS + 角色 TTS
 */
async function composeFinal(videoPath, configPath, outputPath) {
  const startTime = Date.now()

  if (!existsSync(videoPath)) {
    throw new Error(`影片不存在：${videoPath}`)
  }

  const config = JSON.parse(readFileSync(configPath, 'utf-8'))
  const dir = dirname(outputPath)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }

  const ffmpegPath = await getFFmpegPath()
  const inputs = ['-i', videoPath]
  const audioFilters = []
  const allLabels = []
  let inputIndex = 1

  // === Layer 1: Veo 3 環境音（從動畫影片抽取）===
  let panelStartSec = 0
  for (const panel of config.panels) {
    const ambientVol = panel.ambientAudio?.volume ?? 0.15
    if (ambientVol > 0 && panel.animatedVideoPath && existsSync(panel.animatedVideoPath)) {
      inputs.push('-i', panel.animatedVideoPath)
      const delayMs = Math.round(panelStartSec * 1000)
      const label = `amb${inputIndex}`
      audioFilters.push(
        `[${inputIndex}:a]adelay=${delayMs}|${delayMs},volume=${ambientVol}[${label}]`
      )
      allLabels.push(`[${label}]`)
      inputIndex++
    }
    panelStartSec += panel.durationSec
  }

  // === Layer 2: BGM ===
  const bgm = config.bgm
  if (bgm?.track && existsSync(bgm.track)) {
    inputs.push('-i', bgm.track)
    const bgmVolume = bgm.volume || 0.3
    const fadeInSec = bgm.fadeInSec || 1.0
    const fadeOutSec = bgm.fadeOutSec || 2.0
    const totalDuration = config.totalDurationSec + (config.endCard?.durationSec || 3)

    const label = `bgm`
    audioFilters.push(
      `[${inputIndex}:a]aloop=loop=-1:size=2e+09,atrim=0:${totalDuration},afade=t=in:d=${fadeInSec},afade=t=out:st=${totalDuration - fadeOutSec}:d=${fadeOutSec},volume=${bgmVolume}[${label}]`
    )
    allLabels.push(`[${label}]`)
    inputIndex++
  }

  // === Layer 3 & 4: TTS（旁白 + 角色對白/OS）===
  panelStartSec = 0
  for (const panel of config.panels) {
    if (panel.tts) {
      for (const tts of panel.tts) {
        if (tts.audioPath && existsSync(tts.audioPath)) {
          inputs.push('-i', tts.audioPath)
          const delaySec = panelStartSec + (tts.delaySec || 0)
          const delayMs = Math.round(delaySec * 1000)

          // 根據 layer 設定音量
          let volume = 1.0
          if (tts.layer === 'narration') volume = 1.0
          else if (tts.layer === 'dialogue') volume = 0.9
          else if (tts.layer === 'character-os') volume = 0.85

          const label = `tts${inputIndex}`
          audioFilters.push(
            `[${inputIndex}:a]adelay=${delayMs}|${delayMs},volume=${volume}[${label}]`
          )
          allLabels.push(`[${label}]`)
          inputIndex++
        }
      }
    }
    panelStartSec += panel.durationSec
  }

  // === 混合所有音軌 ===
  if (allLabels.length === 0) {
    // 無任何音軌，直接複製影片
    const args = ['-i', videoPath, '-c', 'copy', '-y', outputPath]
    await runFFmpeg(ffmpegPath, args)
  } else {
    const mixFilter = `${allLabels.join('')}amix=inputs=${allLabels.length}:duration=longest:normalize=0[aout]`
    const filterComplex = [...audioFilters, mixFilter].join(';')

    const args = [
      ...inputs,
      '-filter_complex', filterComplex,
      '-map', '0:v',
      '-map', '[aout]',
      '-c:v', 'copy',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-shortest',
      '-y',
      outputPath,
    ]
    await runFFmpeg(ffmpegPath, args)
  }

  const stats = statSync(outputPath)
  const totalDurationSec = config.totalDurationSec + (config.endCard?.durationSec || 3)

  return {
    success: true,
    path: outputPath,
    layers: {
      ambient: allLabels.filter((l) => l.includes('amb')).length,
      bgm: allLabels.filter((l) => l.includes('bgm')).length,
      tts: allLabels.filter((l) => l.includes('tts')).length,
    },
    durationSec: totalDurationSec,
    fileSizeMB: Math.round((stats.size / 1024 / 1024) * 100) / 100,
    processingMs: Date.now() - startTime,
  }
}

// === 工具函數 ===

function mapTransitionToXfade(type) {
  const map = {
    'fade': 'fade',
    'slide-left': 'slideleft',
    'slide-up': 'slideup',
    'zoom': 'smoothup',
    'none': 'fade',
  }
  return map[type] || 'fade'
}

async function runFFmpeg(ffmpegPath, args) {
  try {
    await execFileAsync(ffmpegPath, args, {
      timeout: 300000,
      maxBuffer: 10 * 1024 * 1024,
    })
  } catch (error) {
    // FFmpeg stderr 輸出不代表失敗
    const outputPath = args[args.length - 1]
    if (existsSync(outputPath) && statSync(outputPath).size > 0) {
      return
    }
    throw error
  }
}

async function getFFmpegPath() {
  try {
    await execFileAsync('which', ['ffmpeg'])
    return 'ffmpeg'
  } catch {
    try {
      const ffmpegStatic = await import('ffmpeg-static')
      return ffmpegStatic.default
    } catch {
      throw new Error('找不到 FFmpeg。請安裝 FFmpeg 或執行 npm install ffmpeg-static')
    }
  }
}

// === MCP JSON-RPC ===

async function handleRequest(request) {
  const { method, params, id } = request

  if (method === 'initialize') {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'video-compose', version: '2.0.0' },
      },
    }
  }

  if (method === 'notifications/initialized') {
    return null
  }

  if (method === 'tools/list') {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        tools: [
          {
            name: 'render_video',
            description:
              '拼接動畫片段（Veo 3）或靜態圖片（Ken Burns）為完整影片。支援 xfade 轉場和片尾卡。輸出為無音軌的 MP4。',
            inputSchema: {
              type: 'object',
              properties: {
                configPath: {
                  type: 'string',
                  description: 'video-config.json 的完整路徑',
                },
                outputPath: {
                  type: 'string',
                  description: '輸出影片的完整路徑',
                },
              },
              required: ['configPath', 'outputPath'],
            },
          },
          {
            name: 'compose_final',
            description:
              '四層音軌合成：Veo 3 環境音（15%）+ BGM（30%）+ 旁白 TTS（100%）+ 角色 OS/對白 TTS（85-90%）。根據 video-config.json 的時間軸精確對齊。',
            inputSchema: {
              type: 'object',
              properties: {
                videoPath: {
                  type: 'string',
                  description: 'render_video 產出的影片路徑',
                },
                configPath: {
                  type: 'string',
                  description: 'video-config.json 路徑',
                },
                outputPath: {
                  type: 'string',
                  description: '最終影片輸出路徑',
                },
              },
              required: ['videoPath', 'configPath', 'outputPath'],
            },
          },
        ],
      },
    }
  }

  if (method === 'tools/call') {
    const { name, arguments: args } = params

    if (name === 'render_video') {
      try {
        const result = await renderVideo(args.configPath, args.outputPath)
        return {
          jsonrpc: '2.0',
          id,
          result: { content: [{ type: 'text', text: JSON.stringify(result) }] },
        }
      } catch (error) {
        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [{ type: 'text', text: `影片渲染失敗：${error.message}` }],
            isError: true,
          },
        }
      }
    }

    if (name === 'compose_final') {
      try {
        const result = await composeFinal(args.videoPath, args.configPath, args.outputPath)
        return {
          jsonrpc: '2.0',
          id,
          result: { content: [{ type: 'text', text: JSON.stringify(result) }] },
        }
      } catch (error) {
        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [{ type: 'text', text: `音軌合成失敗：${error.message}` }],
            isError: true,
          },
        }
      }
    }
  }

  return {
    jsonrpc: '2.0',
    id,
    error: { code: -32601, message: `Unknown method: ${method}` },
  }
}

async function main() {
  let buffer = ''
  stdin.setEncoding('utf-8')
  stdin.on('data', async (chunk) => {
    buffer += chunk
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      try {
        const request = JSON.parse(trimmed)
        const response = await handleRequest(request)
        if (response) {
          stdout.write(JSON.stringify(response) + '\n')
        }
      } catch {
        // skip parse errors
      }
    }
  })
}

main()
