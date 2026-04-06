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

const VEO_MODEL = process.env.VEO_MODEL || 'veo-3.0-generate-001'
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
 * 讀取圖片為 { imageBytes, mimeType } 物件
 */
function readImage(filePath) {
  if (!existsSync(filePath)) {
    throw new Error(`圖片不存在：${filePath}`)
  }
  const ext = extname(filePath).toLowerCase()
  const mimeType = MIME_TYPES[ext] || 'image/png'
  const imageBytes = readFileSync(filePath).toString('base64')
  return { imageBytes, mimeType }
}

/**
 * 將靜態圖片轉為動畫影片
 * 支援單圖模式（image）與多圖參考模式（referenceImages）
 */
async function animateImage(imagePath, prompt, outputPath, options = {}) {
  const startTime = Date.now()
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY 環境變數未設定')
  }

  const ai = new GoogleGenAI({ apiKey })

  const { aspectRatio, numberOfVideos, negativePrompt, referenceImages } = options

  // 建立生成配置
  const config = {
    aspectRatio: aspectRatio || '9:16',
    numberOfVideos: numberOfVideos || 1,
  }

  if (negativePrompt) {
    config.negativePrompt = negativePrompt
  }

  // 建立 generateVideos 參數
  const generateParams = {
    model: VEO_MODEL,
    prompt,
    config,
  }

  if (referenceImages && referenceImages.length > 0) {
    // 多圖參考模式：referenceImages（最多 3 張 asset + 1 張 style）
    // 注意：referenceImages 與 image 互斥，不能同時使用
    config.referenceImages = referenceImages.map((ref) => {
      const img = readImage(ref.imagePath)
      return {
        image: {
          imageBytes: img.imageBytes,
          mimeType: img.mimeType,
        },
        referenceType: ref.referenceType || 'REFERENCE_TYPE_ASSET',
      }
    })
  } else {
    // 單圖模式：傳統 image-to-video
    if (!existsSync(imagePath)) {
      throw new Error(`圖片不存在：${imagePath}`)
    }
    const img = readImage(imagePath)
    generateParams.image = {
      imageBytes: img.imageBytes,
      mimeType: img.mimeType,
    }
  }

  // 發送非同步生成請求
  let operation = await ai.models.generateVideos(generateParams)

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
    const count = response?.raiMediaFilteredCount || 0
    const debugInfo = JSON.stringify(response, null, 2)
    throw new Error(`影片生成失敗（過濾 ${count} 個）：${reasons}\n回應詳情：${debugInfo}`)
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
    // URI 需要帶 API key 認證
    const uri = video.video.uri.includes('?')
      ? `${video.video.uri}&key=${apiKey}`
      : `${video.video.uri}?key=${apiKey}`
    const res = await fetch(uri)
    if (!res.ok) {
      throw new Error(`影片下載失敗（HTTP ${res.status}）：${await res.text()}`)
    }
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
              '使用 Google Veo API 將靜態圖片轉為動畫影片。支援單圖 image-to-video 與多圖 referenceImages 模式（最多 3 張 asset 參考圖）。生成為非同步操作，約需 1-3 分鐘。',
            inputSchema: {
              type: 'object',
              properties: {
                imagePath: {
                  type: 'string',
                  description: '輸入圖片的完整檔案路徑（單圖模式使用，與 referenceImages 互斥）',
                },
                prompt: {
                  type: 'string',
                  description: '動畫描述 prompt（英文）。描述動作與場景。',
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
                  description: '負面提示詞，描述不想要的效果',
                },
                referenceImages: {
                  type: 'array',
                  description: '多圖參考模式（與 imagePath 互斥）。最多 3 張 asset 圖。傳入後會使用 referenceImages API 而非單圖 image-to-video。',
                  items: {
                    type: 'object',
                    properties: {
                      imagePath: {
                        type: 'string',
                        description: '參考圖片的完整檔案路徑',
                      },
                      referenceType: {
                        type: 'string',
                        description: '參考類型：REFERENCE_TYPE_ASSET（保持主體外觀）或 REFERENCE_TYPE_STYLE（風格參考，僅 Veo 2）',
                        enum: ['REFERENCE_TYPE_ASSET', 'REFERENCE_TYPE_STYLE'],
                      },
                    },
                    required: ['imagePath'],
                  },
                },
              },
              required: ['prompt', 'outputPath'],
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
            referenceImages: args.referenceImages,
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
