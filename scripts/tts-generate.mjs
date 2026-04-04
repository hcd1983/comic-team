#!/usr/bin/env node

/**
 * TTS 語音生成 MCP Server
 * 使用 Edge TTS（免費）生成中文語音
 * 支援聲優選擇、語速/音調/音量調整
 * 使用 stdio transport + JSON-RPC
 */

import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs'
import { dirname, resolve } from 'path'
import { stdin, stdout } from 'process'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { tmpdir } from 'os'
import { join } from 'path'

const execFileAsync = promisify(execFile)

// Edge TTS 中文聲優清單（台灣中文）
const ZH_TW_VOICES = [
  { voiceId: 'zh-TW-HsiaoChenNeural', name: '曉臻', gender: 'Female', locale: 'zh-TW', style: '年輕女性，清晰溫柔' },
  { voiceId: 'zh-TW-YunJheNeural', name: '雲哲', gender: 'Male', locale: 'zh-TW', style: '年輕男性，沉穩清晰' },
  { voiceId: 'zh-TW-HsiaoYuNeural', name: '曉雨', gender: 'Female', locale: 'zh-TW', style: '成熟女性，溫和親切' },
]

const ZH_CN_VOICES = [
  { voiceId: 'zh-CN-XiaoxiaoNeural', name: '曉曉', gender: 'Female', locale: 'zh-CN', style: '年輕女性，活潑' },
  { voiceId: 'zh-CN-YunxiNeural', name: '雲希', gender: 'Male', locale: 'zh-CN', style: '年輕男性，陽光' },
  { voiceId: 'zh-CN-YunjianNeural', name: '雲健', gender: 'Male', locale: 'zh-CN', style: '成熟男性，穩重' },
  { voiceId: 'zh-CN-XiaoyiNeural', name: '曉伊', gender: 'Female', locale: 'zh-CN', style: '少女，甜美' },
]

const ALL_VOICES = [...ZH_TW_VOICES, ...ZH_CN_VOICES]

const MAX_RETRIES = 3
const RETRY_DELAY_MS = 2000

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * 使用 edge-tts CLI 生成語音
 * edge-tts 透過 npx 或全域安裝的 edge-tts 執行
 */
async function generateSpeech(text, outputPath, options = {}, retryCount = 0) {
  const startTime = Date.now()

  const {
    voiceId = 'zh-TW-HsiaoChenNeural',
    rate = '+0%',
    pitch = '+0Hz',
    volume = '+0%',
  } = options

  const dir = dirname(outputPath)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }

  // 建立 SSML 或直接用 edge-tts CLI 參數
  const args = [
    'edge-tts',
    '--voice', voiceId,
    '--rate', rate,
    '--pitch', pitch,
    '--volume', volume,
    '--text', text,
    '--write-media', outputPath,
  ]

  try {
    await execFileAsync('npx', args, {
      timeout: 30000,
      env: { ...process.env, NODE_NO_WARNINGS: '1' },
    })

    // 取得檔案大小
    const stats = readFileSync(outputPath)
    const fileSizeBytes = stats.length

    // 估算音檔時長（粗略：中文約每秒 3-4 個字）
    const estimatedDurationMs = Math.round((text.length / 3.5) * 1000)

    return {
      success: true,
      path: outputPath,
      durationMs: estimatedDurationMs,
      fileSizeBytes,
      processingMs: Date.now() - startTime,
      retries: retryCount,
    }
  } catch (error) {
    if (retryCount < MAX_RETRIES) {
      await sleep(RETRY_DELAY_MS)
      return generateSpeech(text, outputPath, options, retryCount + 1)
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
        serverInfo: { name: 'tts-generate', version: '1.0.0' },
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
            name: 'generate_speech',
            description: '將文字轉為語音檔（MP3）。使用 Edge TTS（免費），支援中文台灣/中國聲優、語速、音調、音量調整。',
            inputSchema: {
              type: 'object',
              properties: {
                text: {
                  type: 'string',
                  description: '要朗讀的文字（繁體中文）',
                },
                outputPath: {
                  type: 'string',
                  description: '輸出 .mp3 檔案的完整路徑',
                },
                voiceId: {
                  type: 'string',
                  description: 'Edge TTS 聲優 ID（預設 zh-TW-HsiaoChenNeural）。可用 list_voices 查詢。',
                },
                rate: {
                  type: 'string',
                  description: '語速調整（如 "+10%"、"-15%"，預設 "+0%"）',
                },
                pitch: {
                  type: 'string',
                  description: '音調調整（如 "+2Hz"、"-3Hz"，預設 "+0Hz"）',
                },
                volume: {
                  type: 'string',
                  description: '音量調整（如 "+20%"、"-30%"，預設 "+0%"）',
                },
              },
              required: ['text', 'outputPath'],
            },
          },
          {
            name: 'list_voices',
            description: '列出可用的中文 TTS 聲優清單。',
            inputSchema: {
              type: 'object',
              properties: {
                locale: {
                  type: 'string',
                  description: '篩選語系（"zh-TW" 或 "zh-CN" 或 "all"，預設 "all"）',
                },
              },
            },
          },
          {
            name: 'assign_character_voice',
            description: '根據角色特徵推薦合適的聲優。傳入角色描述，回傳推薦的 voiceId 和參數。',
            inputSchema: {
              type: 'object',
              properties: {
                characterName: {
                  type: 'string',
                  description: '角色名稱',
                },
                gender: {
                  type: 'string',
                  description: '角色性別（男/女）',
                },
                age: {
                  type: 'string',
                  description: '角色年齡描述（如「少女」「中年男性」「老奶奶」）',
                },
                personality: {
                  type: 'string',
                  description: '角色性格（如「活潑開朗」「沉穩內斂」）',
                },
              },
              required: ['characterName', 'gender'],
            },
          },
        ],
      },
    }
  }

  if (method === 'tools/call') {
    const { name, arguments: args } = params

    if (name === 'generate_speech') {
      try {
        const result = await generateSpeech(args.text, args.outputPath, {
          voiceId: args.voiceId,
          rate: args.rate,
          pitch: args.pitch,
          volume: args.volume,
        })
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
            content: [{ type: 'text', text: `TTS 生成失敗：${error.message}（已重試 ${MAX_RETRIES} 次）` }],
            isError: true,
          },
        }
      }
    }

    if (name === 'list_voices') {
      const locale = args?.locale || 'all'
      const voices = locale === 'all'
        ? ALL_VOICES
        : ALL_VOICES.filter((v) => v.locale === locale)
      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [{ type: 'text', text: JSON.stringify({ voices }) }],
        },
      }
    }

    if (name === 'assign_character_voice') {
      const { characterName, gender, age, personality } = args
      let voiceId, rate, pitch, volume

      // 根據性別和年齡選擇基礎聲優
      if (gender === '女' || gender === 'female' || gender === 'F') {
        if (age && (age.includes('少女') || age.includes('年輕') || age.includes('小'))) {
          voiceId = 'zh-TW-HsiaoChenNeural'
          pitch = '+2Hz'
        } else if (age && (age.includes('老') || age.includes('阿嬤') || age.includes('奶奶'))) {
          voiceId = 'zh-TW-HsiaoYuNeural'
          rate = '-10%'
          pitch = '-3Hz'
        } else {
          voiceId = 'zh-TW-HsiaoYuNeural'
        }
      } else {
        if (age && (age.includes('少年') || age.includes('年輕') || age.includes('小'))) {
          voiceId = 'zh-TW-YunJheNeural'
          pitch = '+1Hz'
        } else if (age && (age.includes('老') || age.includes('阿公') || age.includes('爺爺'))) {
          voiceId = 'zh-TW-YunJheNeural'
          rate = '-10%'
          pitch = '-3Hz'
        } else {
          voiceId = 'zh-TW-YunJheNeural'
        }
      }

      // 根據性格微調
      if (personality) {
        if (personality.includes('活潑') || personality.includes('開朗') || personality.includes('熱血')) {
          rate = rate || '+5%'
          volume = '+10%'
        } else if (personality.includes('安靜') || personality.includes('內斂') || personality.includes('沉穩')) {
          rate = rate || '-5%'
          volume = '-5%'
        }
      }

      const recommendation = {
        characterName,
        voiceId,
        rate: rate || '+0%',
        pitch: pitch || '+0Hz',
        volume: volume || '+0%',
        voiceName: ALL_VOICES.find((v) => v.voiceId === voiceId)?.name || voiceId,
      }

      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [{ type: 'text', text: JSON.stringify(recommendation) }],
        },
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
