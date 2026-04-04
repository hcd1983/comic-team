#!/usr/bin/env node

/**
 * Video Compose MCP Server
 * 使用 Remotion（React 影片渲染）+ FFmpeg（音軌合成）生成短影片
 * 使用 stdio transport + JSON-RPC
 *
 * Tools:
 *   render_video   — 將 video-config.json 渲染為無聲影片
 *   compose_final  — 混合無聲影片 + TTS 音檔 + BGM → 最終影片
 */

import { readFileSync, existsSync, mkdirSync, statSync } from 'fs'
import { dirname, resolve, join } from 'path'
import { stdin, stdout } from 'process'
import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

/**
 * 渲染影片（使用 Remotion programmatic API）
 * 備選：若 Remotion 不可用，降級為 FFmpeg zoompan
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

  // 嘗試使用 Remotion
  try {
    const remotionEntry = resolve(
      dirname(new URL(import.meta.url).pathname),
      'video/src/Root.tsx'
    )

    // 使用 npx remotion render 指令
    const args = [
      'remotion', 'render',
      remotionEntry,
      'ComicVideo',
      outputPath,
      '--props', JSON.stringify({ config }),
      '--codec', 'h264',
      '--image-format', 'jpeg',
      '--log', 'error',
    ]

    await execFileAsync('npx', args, {
      timeout: 300000, // 5 分鐘超時
      cwd: resolve(dirname(new URL(import.meta.url).pathname), 'video'),
      env: { ...process.env, NODE_NO_WARNINGS: '1' },
    })
  } catch (remotionError) {
    // 降級：使用 FFmpeg 做簡單拼接 + Ken Burns
    console.error('Remotion 渲染失敗，降級為 FFmpeg 方案:', remotionError.message)
    await renderWithFFmpeg(config, outputPath)
  }

  const stats = statSync(outputPath)

  return {
    success: true,
    path: outputPath,
    durationSec: config.totalDurationSec,
    fileSizeMB: Math.round(stats.size / 1024 / 1024 * 100) / 100,
    processingMs: Date.now() - startTime,
  }
}

/**
 * FFmpeg 降級方案：簡單圖片序列 + zoompan（Ken Burns）
 */
async function renderWithFFmpeg(config, outputPath) {
  const { panels, resolution, fps, endCard } = config
  const { width, height } = resolution

  // 建立 FFmpeg filter_complex
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

    // zoompan 模擬 Ken Burns
    const kb = panel.kenBurns || { startScale: 1, endScale: 1.1 }
    const zoomStart = kb.startScale
    const zoomEnd = kb.endScale
    const zoomExpr = `${zoomStart}+(${zoomEnd}-${zoomStart})*on/${durationFrames}`

    filterParts.push(
      `[${i}:v]scale=${width * 2}:${height * 2},zoompan=z='${zoomExpr}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${durationFrames}:s=${width}x${height}:fps=${fps},trim=duration=${panel.durationSec},setpts=PTS-STARTPTS,setsar=1[v${i}]`
    )
    concatInputs.push(`[v${i}]`)
  }

  // 黑色片尾卡
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

  try {
    await execFileAsync(ffmpegPath, args, { timeout: 300000, maxBuffer: 10 * 1024 * 1024 })
  } catch (error) {
    // FFmpeg 會把進度資訊寫到 stderr，導致 execFile 認為失敗
    // 如果檔案存在且大小 > 0，視為成功
    if (existsSync(outputPath) && statSync(outputPath).size > 0) {
      return // 成功
    }
    throw error
  }
}

/**
 * 最終合成：無聲影片 + TTS 音檔 + BGM → 最終影片
 */
async function composeFinal(videoPath, configPath, outputPath) {
  const startTime = Date.now()

  if (!existsSync(videoPath)) {
    throw new Error(`無聲影片不存在：${videoPath}`)
  }
  if (!existsSync(configPath)) {
    throw new Error(`video-config.json 不存在：${configPath}`)
  }

  const config = JSON.parse(readFileSync(configPath, 'utf-8'))
  const dir = dirname(outputPath)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }

  const ffmpegPath = await getFFmpegPath()

  // 收集所有音軌
  const inputs = ['-i', videoPath]
  const audioFilters = []
  let inputIndex = 1

  // TTS 音檔
  let panelStartSec = 0
  for (const panel of config.panels) {
    if (panel.tts) {
      for (const tts of panel.tts) {
        const audioPath = tts.audioPath
        if (audioPath && existsSync(audioPath)) {
          inputs.push('-i', audioPath)
          const delaySec = panelStartSec + (tts.delaySec || 0)
          const delayMs = Math.round(delaySec * 1000)
          audioFilters.push(
            `[${inputIndex}:a]adelay=${delayMs}|${delayMs},volume=1.0[tts${inputIndex}]`
          )
          inputIndex++
        }
      }
    }
    panelStartSec += panel.durationSec
  }

  // BGM
  const bgm = config.bgm
  let bgmFilterLabel = ''
  if (bgm?.track && existsSync(bgm.track)) {
    inputs.push('-i', bgm.track)
    const bgmVolume = bgm.volume || 0.3
    const fadeInSec = bgm.fadeInSec || 1.0
    const fadeOutSec = bgm.fadeOutSec || 2.0
    const totalDuration = config.totalDurationSec + (config.endCard?.durationSec || 3)

    audioFilters.push(
      `[${inputIndex}:a]aloop=loop=-1:size=2e+09,atrim=0:${totalDuration},afade=t=in:d=${fadeInSec},afade=t=out:st=${totalDuration - fadeOutSec}:d=${fadeOutSec},volume=${bgmVolume}[bgm]`
    )
    bgmFilterLabel = '[bgm]'
    inputIndex++
  }

  // 混合所有音軌
  if (audioFilters.length === 0) {
    // 無音軌，直接複製
    const args = [
      ...inputs,
      '-c', 'copy',
      '-y',
      outputPath,
    ]
    await execFileAsync(ffmpegPath, args, { timeout: 120000 })
  } else {
    const ttsLabels = audioFilters
      .filter((_, i) => !audioFilters[i].includes('[bgm]'))
      .map((f) => {
        const match = f.match(/\[tts\d+\]/)
        return match ? match[0] : ''
      })
      .filter(Boolean)

    const allLabels = [...ttsLabels, bgmFilterLabel].filter(Boolean)
    const mixFilter = `${allLabels.join('')}amix=inputs=${allLabels.length}:duration=longest[aout]`

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
    await execFileAsync(ffmpegPath, args, { timeout: 120000 })
  }

  const stats = statSync(outputPath)
  const totalDurationSec = config.totalDurationSec + (config.endCard?.durationSec || 3)

  return {
    success: true,
    path: outputPath,
    durationSec: totalDurationSec,
    fileSizeMB: Math.round(stats.size / 1024 / 1024 * 100) / 100,
    processingMs: Date.now() - startTime,
  }
}

/**
 * 取得 FFmpeg 路徑（優先系統安裝，備選 ffmpeg-static）
 */
async function getFFmpegPath() {
  // 嘗試系統 ffmpeg
  try {
    await execFileAsync('which', ['ffmpeg'])
    return 'ffmpeg'
  } catch {
    // 嘗試 ffmpeg-static
    try {
      const ffmpegStatic = await import('ffmpeg-static')
      return ffmpegStatic.default
    } catch {
      throw new Error('找不到 FFmpeg。請安裝 FFmpeg 或執行 npm install ffmpeg-static')
    }
  }
}

// MCP JSON-RPC handler
async function handleRequest(request) {
  const { method, params, id } = request

  if (method === 'initialize') {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'video-compose', version: '1.0.0' },
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
            description: '將 video-config.json 渲染為無聲影片（MP4）。使用 Remotion 渲染 Ken Burns + 字幕 + 轉場動畫，若 Remotion 不可用則自動降級為 FFmpeg。',
            inputSchema: {
              type: 'object',
              properties: {
                configPath: {
                  type: 'string',
                  description: 'video-config.json 的完整檔案路徑',
                },
                outputPath: {
                  type: 'string',
                  description: '輸出無聲影片的完整路徑（如 output/{slug}/{version}/video/raw.mp4）',
                },
              },
              required: ['configPath', 'outputPath'],
            },
          },
          {
            name: 'compose_final',
            description: '將無聲影片 + TTS 音檔 + BGM 混合為最終影片。根據 video-config.json 的時間軸對齊所有音軌。',
            inputSchema: {
              type: 'object',
              properties: {
                videoPath: {
                  type: 'string',
                  description: 'render_video 產出的無聲影片路徑',
                },
                configPath: {
                  type: 'string',
                  description: 'video-config.json 的完整路徑（含 TTS audioPath 和 BGM 資訊）',
                },
                outputPath: {
                  type: 'string',
                  description: '最終影片輸出路徑（如 output/{slug}/{version}/video/final.mp4）',
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
          result: {
            content: [{ type: 'text', text: JSON.stringify(result) }],
          },
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
          result: {
            content: [{ type: 'text', text: JSON.stringify(result) }],
          },
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

// stdio transport
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
