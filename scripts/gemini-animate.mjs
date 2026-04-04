#!/usr/bin/env node

/**
 * Gemini Animate MCP Server
 * 使用 Google Veo 2 API 將靜態漫畫圖片轉為動畫影片
 * 支援 image-to-video、動作 prompt、aspectRatio
 * 使用 stdio transport + JSON-RPC
 *
 * 環境變數：
 *   GEMINI_API_KEY  — Gemini API 金鑰（必要，與 gemini-draw 共用）
 *   VEO_MODEL       — Veo 模型名稱（預設 veo-2.0-generate-001）
 */

import { GoogleGenAI } from '@google/genai'
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'fs'
import { dirname, extname } from 'path'
import { stdin, stdout } from 'process'

const VEO_MODEL = process.env.VEO_MODEL || 'veo-2.0-generate-001'
const POLL_INTERVAL_MS = 10000 // 10 秒輪詢一次
const MAX_POLL_ATTEMPTS = 60   // 最多等 10 分鐘

const MIME_TYPES = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * 將靜態圖片轉為動畫影片
 */
async function animateImage(imagePath, prompt, outputPath, options = {}) {
  const startTime = Date.now()
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY 環境變數未設定')
  }

  if (!existsSync(imagePath)) {
    throw new Error(`圖片不存在：${imagePath}`)
  }

  const ai = new GoogleGenAI({ apiKey })

  // 讀取圖片為 base64
  const ext = extname(imagePath).toLowerCase()
  const mimeType = MIME_TYPES[ext] || 'image/png'
  const imageBytes = readFileSync(imagePath).toString('base64')

  const { aspectRatio, numberOfVideos, negativePrompt } = options

  // 建立生成配置
  const config = {
    aspectRatio: aspectRatio || '9:16',
    numberOfVideos: numberOfVideos || 1,
    personGeneration: 'allow',
  }

  if (negativePrompt) {
    config.negativePrompt = negativePrompt
  }

  // 發送非同步生成請求
  let operation = await ai.models.generateVideos({
    model: VEO_MODEL,
    prompt,
    image: {
      imageBytes,
      mimeType,
    },
    config,
  })

  // 輪詢等待完成
  let attempts = 0
  while (!operation.done) {
    if (attempts >= MAX_POLL_ATTEMPTS) {
      throw new Error(`影片生成超時（等待超過 ${MAX_POLL_ATTEMPTS * POLL_INTERVAL_MS / 1000} 秒）`)
    }
    await sleep(POLL_INTERVAL_MS)
    operation = await ai.operations.getVideosOperation({ operation })
    attempts++
  }

  // 檢查結果
  const response = operation.response
  if (!response?.generatedVideos?.length) {
    const reasons = response?.raiMediaFilteredReasons?.join(', ') || '未知原因'
    throw new Error(`影片生成失敗：${reasons}`)
  }

  // 儲存影片
  const video = response.generatedVideos[0]
  const dir = dirname(outputPath)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }

  // video.video 包含影片資料（base64 或 URI）
  if (video.video?.videoBytes) {
    const buffer = Buffer.from(video.video.videoBytes, 'base64')
    writeFileSync(outputPath, buffer)
  } else if (video.video?.uri) {
    // 如果是 URI，需要下載
    const res = await fetch(video.video.uri)
    const buffer = Buffer.from(await res.arrayBuffer())
    writeFileSync(outputPath, buffer)
  } else {
    throw new Error('影片回應中沒有可用的影片資料')
  }

  const fileSize = statSync(outputPath).size

  return {
    success: true,
    path: outputPath,
    fileSizeMB: Math.round(fileSize / 1024 / 1024 * 100) / 100,
    pollAttempts: attempts,
    durationMs: Date.now() - startTime,
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
        serverInfo: { name: 'gemini-animate', version: '1.0.0' },
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
            name: 'gemini_animate',
            description:
              '使用 Google Veo 2 API 將靜態漫畫圖片轉為動畫影片。支援 image-to-video，可透過 prompt 描述角色動作（如眨眼、微笑、轉頭）。生成為非同步操作，約需 1-3 分鐘。',
            inputSchema: {
              type: 'object',
              properties: {
                imagePath: {
                  type: 'string',
                  description: '輸入圖片的完整檔案路徑（漫畫格圖片）',
                },
                prompt: {
                  type: 'string',
                  description:
                    '動畫描述 prompt（英文）。描述角色的動作，如 "The character slowly blinks and slightly tilts head with a gentle smile"。保持動作幅度小，避免大幅度移動。',
                },
                outputPath: {
                  type: 'string',
                  description: '輸出影片的完整路徑（.mp4）',
                },
                aspectRatio: {
                  type: 'string',
                  description: '輸出影片的長寬比（"9:16" 或 "16:9"，預設 "9:16"）',
                },
                negativePrompt: {
                  type: 'string',
                  description: '負面提示詞，描述不想要的效果（如 "realistic style change, large movements, morphing"）',
                },
              },
              required: ['imagePath', 'prompt', 'outputPath'],
            },
          },
        ],
      },
    }
  }

  if (method === 'tools/call') {
    const { name, arguments: args } = params

    if (name === 'gemini_animate') {
      try {
        const result = await animateImage(
          args.imagePath,
          args.prompt,
          args.outputPath,
          {
            aspectRatio: args.aspectRatio,
            negativePrompt: args.negativePrompt,
          }
        )
        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [{ type: 'text', text: JSON.stringify(result) }],
          },
        }
      } catch (error) {
        const message = error.message || String(error)
        const isSafety = message.includes('safety') || message.includes('blocked') || message.includes('filtered')
        const isQuota = message.includes('429') || message.includes('quota')

        let hint = ''
        if (isSafety) hint = '（建議修改動畫 prompt，避免敏感內容）'
        if (isQuota) hint = '（API 配額已滿，建議稍後重試）'

        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [{ type: 'text', text: `動畫生成失敗：${message}${hint}` }],
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
