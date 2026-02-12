const WebSocket = require('ws');
const { DASHSCOPE_API_KEY, DASHSCOPE_MODEL } = require('./electron/config');

console.log('=== Qwen-ASR Connection Test ===');
console.log('API Key:', DASHSCOPE_API_KEY ? 'Configured (' + DASHSCOPE_API_KEY.slice(0, 4) + '...)' : 'MISSING');
console.log('Model:', DASHSCOPE_MODEL || 'qwen3-asr-flash-realtime');

if (!DASHSCOPE_API_KEY) {
    console.error('Error: No API Key found in electron/config.js');
    process.exit(1);
}

const model = DASHSCOPE_MODEL || 'qwen3-asr-flash-realtime';
const url = `wss://dashscope.aliyuncs.com/api-ws/v1/realtime?model=${model}`;

console.log('Connecting to:', url);

const ws = new WebSocket(url, {
    headers: {
        'Authorization': `Bearer ${DASHSCOPE_API_KEY}`
    }
});

ws.on('open', () => {
    console.log('[Success] WebSocket Connected!');

    // 1. Send Session Update
    const sessionConfig = {
        header: {
            action: "run-task",
            task_id: "test-" + Date.now()
        },
        payload: {
            task_group: "audio",
            task: "asr",
            function: "recognition",
            model: model,
            parameters: {
                format: "pcm",
                sample_rate: 16000,
                enable_intermediate_result: true,
                enable_punctuation_prediction: true,
                enable_inverse_text_normalization: true
            },
            input: {
                audio_format: "pcm",
                sample_rate: 16000,
                channel: 1
            }
        }
    };

    // WAIT! My research said "session.update" (OpenAI format) OR "run-task" (DashScope native).
    // The search results were mixed. 
    // "qwen3-asr-flash-realtime" usually uses the *OpenAI Compatible* API which uses `session.update`.
    // BUT the URL `api-ws/v1/realtime` suggests the native one or the OpenAI one?
    // Let's try sending the OpenAI format first, as I did in the app.

    const openAILikeConfig = {
        type: "session.update",
        session: {
            input_audio_format: "pcm",
            input_audio_transcription: {
                model: model,
                language: "zh",
                keywords: ["预言家", "狼人", "女巫", "猎人", "守卫", "白痴", "狼王", "查杀", "金水", "银水", "悍跳", "倒钩", "冲票", "自爆", "警徽流", "上警", "退水"]
            },
            turn_detection: {
                type: "server_vad"
            }
        }
    };

    console.log('Sending session config (OpenAI-like)...');
    ws.send(JSON.stringify(openAILikeConfig));

    // Send 1 second of silence
    const silence = Buffer.alloc(32000); // 1s of 16k 16bit mono
    const base64Audio = silence.toString('base64');

    console.log('Sending 1s silence...');
    ws.send(JSON.stringify({
        type: "input_audio_buffer.append",
        audio: base64Audio
    }));

    setTimeout(() => {
        console.log('Sending session.finish...');
        // ws.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
        ws.close();
    }, 2000);
});

ws.on('message', (data) => {
    console.log('[Message] Received:', data.toString());
});

ws.on('error', (err) => {
    console.error('[Error] WebSocket Error:', err.message);
});

ws.on('close', (code, reason) => {
    console.log(`[Closed] Code: ${code}, Reason: ${reason}`);
});
