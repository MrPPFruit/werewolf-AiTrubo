const WebSocket = require('ws');
const { DASHSCOPE_API_KEY, DASHSCOPE_MODEL } = require('./config');

class DashScopeClient {
    constructor(onText, onError) {
        this.ws = null;
        this.onText = onText;
        this.onError = onError;
        this.isReady = false;
        this.bufferQueue = [];
    }

    start() {
        if (!DASHSCOPE_API_KEY) {
            console.error('[DashScope] No API Key provided');
            this.onError("未配置 API Key");
            return;
        }

        const model = DASHSCOPE_MODEL || 'qwen3-asr-flash-realtime';
        // Use the OpenAI-compatible Realtime API endpoint
        const url = `wss://dashscope.aliyuncs.com/api-ws/v1/realtime?model=${model}`;
        console.log('[DashScope] Connecting to:', url);

        try {
            this.ws = new WebSocket(url, {
                headers: {
                    'Authorization': `Bearer ${DASHSCOPE_API_KEY}`
                }
            });

            this.ws.on('open', () => {
                console.log('[DashScope] WebSocket Connected');
                console.log('[DashScope] Sending session.update...');
                this.isReady = true;

                // 1. Configure Session (OpenAI Realtime Protocol)
                const sessionConfig = {
                    type: "session.update",
                    session: {
                        input_audio_format: "pcm", // Fixed: "pcm" instead of "pcm16"
                        input_audio_transcription: {
                            model: model,
                            language: "zh",
                            keywords: ["预言家", "狼人", "女巫", "猎人", "守卫", "白痴", "狼王", "查杀", "金水", "银水", "悍跳", "倒钩", "冲票", "自爆", "警徽流", "上警", "退水"]
                        },
                        turn_detection: {
                            type: "server_vad",
                            threshold: 0.5,
                            prefix_padding_ms: 300,
                            silence_duration_ms: 800
                        }
                    }
                };
                this.ws.send(JSON.stringify(sessionConfig));

                // Flush Audio Queue
                while (this.bufferQueue.length > 0) {
                    const data = this.bufferQueue.shift();
                    this.sendAudio(data);
                }
            });

            this.ws.on('message', (data) => {
                try {
                    const msg = JSON.parse(data.toString());
                    this.handleMessage(msg);
                } catch (e) {
                    // console.error('[DashScope] JSON Parse Error:', e);
                }
            });

            this.ws.on('error', (err) => {
                console.error('[DashScope] WebSocket Error:', err);
                this.onError && this.onError(err.message);
            });

            this.ws.on('close', (code, reason) => {
                console.log(`[DashScope] Closed: ${code} ${reason}`);
                this.isReady = false;
            });
        } catch (e) {
            console.error('[DashScope] Init Error:', e);
            this.onError && this.onError(e.message);
        }
    }

    handleMessage(msg) {
        // Logs for debug
        // console.log('[DashScopeMsg]', JSON.stringify(msg).substring(0, 100));

        // Handle OpenAI-compatible Events
        const type = msg.type;

        if (type === 'session.updated') {
            console.log('[DashScope] Session Configured Successfully');
        } else if (type === 'error') {
            console.error('[DashScope] Server Error:', msg.error);
            this.onError && this.onError(msg.error.message || "Unknown Server Error");
        } else if (type === 'conversation.item.input_audio_transcription.completed') {
            // Final transcription
            if (msg.transcript) {
                this.onText(msg.transcript, true);
            }
        } else if (type === 'conversation.item.input_audio_transcription.failed') {
            console.error('[DashScope] Transcription Failed:', msg.error);
        } else if (type === 'response.audio_transcript.delta') {
            // Real-time delta (if enabled/supported)
            if (msg.delta) {
                this.onText(msg.delta, false);
            }
        } else if (type === 'conversation.item.input_audio_transcription.text') {
            // Some implementations might use this
            if (msg.text) {
                // Usually this is partial?
                // DashScope docs might define specific events.
                // Assuming 'delta' covers partials in standard OpenAI, but let's watch out.
            }
        }
    }

    sendAudio(buffer) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            if (this.ws && this.ws.readyState === WebSocket.CONNECTING) {
                this.bufferQueue.push(buffer);
            }
            return;
        }

        // OpenAI Protocol: Appends audio as Base64 JSON
        try {
            // Debug: Log every 100 packets
            if (Math.random() < 0.01) console.log('[DashScope] Sending audio packet...');

            const base64Audio = buffer.toString('base64');
            const event = {
                type: "input_audio_buffer.append",
                audio: base64Audio
            };
            this.ws.send(JSON.stringify(event));
        } catch (e) {
            console.error('[DashScope] Send Error:', e);
        }
    }

    flush() {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        try {
            console.log('[DashScope] Sending input_audio_buffer.commit...');
            const event = {
                type: "input_audio_buffer.commit"
            };
            this.ws.send(JSON.stringify(event));
        } catch (e) {
            console.error('[DashScope] Flush Error:', e);
        }
    }

    stop() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.isReady = false;
        this.bufferQueue = [];
    }
}

module.exports = DashScopeClient;
