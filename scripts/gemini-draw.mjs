#!/usr/bin/env node

/**
 * Gemini 生圖 MCP Server
 * 透過 Gemini API (nanobanana) 生成漫畫圖片
 * 使用 stdio transport + JSON-RPC
 *
 * 環境變數：
 *   GEMINI_API_KEY  — Gemini API 金鑰（必要）
 *   GEMINI_MODEL    — 模型名稱（預設 gemini-2.0-flash-exp）
 */

import { GoogleGenerativeAI } from '@google/generative-ai'
import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { dirname } from 'path'
import { stdin, stdout } from 'process'

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash-exp'
const MAX_RETRIES = 1
const RETRY_DELAY_MS = 3000

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function generateImage(prompt, outputPath, retryCount = 0) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY 環境變數未設定')
  }

  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({ model: GEMINI_MODEL })

  try {
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        responseModalities: ['image', 'text'],
      },
    })

    const parts = result.response.candidates?.[0]?.content?.parts ?? []

    for (const part of parts) {
      if (part.inlineData) {
        const dir = dirname(outputPath)
        if (!existsSync(dir)) {
          mkdirSync(dir, { recursive: true })
        }

        const buffer = Buffer.from(part.inlineData.data, 'base64')
        writeFileSync(outputPath, buffer)
        return {
          success: true,
          path: outputPath,
          size: buffer.length,
          retries: retryCount,
        }
      }
    }

    throw new Error('Gemini API 未回傳圖片資料')
  } catch (error) {
    if (retryCount < MAX_RETRIES) {
      await sleep(RETRY_DELAY_MS)
      return generateImage(prompt, outputPath, retryCount + 1)
    }
    throw error
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
        serverInfo: { name: 'gemini-draw', version: '1.0.0' },
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
            name: 'gemini_draw',
            description:
              '使用 Gemini API 生成漫畫圖片。傳入 prompt 和輸出路徑，回傳生成的圖片檔案路徑。失敗時自動重試 1 次。',
            inputSchema: {
              type: 'object',
              properties: {
                prompt: {
                  type: 'string',
                  description:
                    '圖片生成的完整 prompt（包含畫風、鏡頭、場景描述、情緒）',
                },
                outputPath: {
                  type: 'string',
                  description:
                    '輸出圖片的完整檔案路徑（如 output/page1_panel1.png）',
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

    if (name === 'gemini_draw') {
      try {
        const result = await generateImage(args.prompt, args.outputPath)
        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result),
              },
            ],
          },
        }
      } catch (error) {
        const message = error.message || String(error)
        const isRateLimit =
          message.includes('429') || message.includes('quota')
        const isSafety =
          message.includes('safety') || message.includes('blocked')

        let hint = ''
        if (isRateLimit) hint = '（建議等待一段時間後重試）'
        if (isSafety) hint = '（建議修改畫面描述，避免敏感內容）'

        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [
              {
                type: 'text',
                text: `生圖失敗：${message}${hint}`,
              },
            ],
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
