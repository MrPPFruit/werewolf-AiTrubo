const WebSocket = require('ws');
const { DASHSCOPE_API_KEY, DASHSCOPE_MODEL } = require('./config');
const logger = require('./logger');

class DashScopeClient {
    constructor(onText, onError) {
        this.ws = null;
        this.onText = onText;
        this.onError = onError;
        this.isReady = false;
        this.bufferQueue = [];
        this.pingInterval = null;
        this.watchdogTimer = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 3;
    }

    start() {
        if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
            logger.warn('[DashScope] Client already started or connecting');
            return;
        }

        if (!DASHSCOPE_API_KEY) {
            logger.error('[DashScope] No API Key provided');
            this.onError("未配置 API Key");
            return;
        }

        const model = DASHSCOPE_MODEL || 'qwen3-asr-flash-realtime';
        const url = `wss://dashscope.aliyuncs.com/api-ws/v1/realtime?model=${model}`;
        logger.info(`[DashScope] Connecting to: ${url} (Attempt ${this.reconnectAttempts + 1}/${this.maxReconnectAttempts})`);

        try {
            this.ws = new WebSocket(url, {
                headers: {
                    'Authorization': `Bearer ${DASHSCOPE_API_KEY}`
                }
            });

            this.ws.on('open', () => {
                logger.info('[DashScope] WebSocket Connected');
                this.isReady = true;
                this.reconnectAttempts = 0; // Reset counter on success
                this.startHeartbeat();

                // ... (session config)
                const sessionConfig = {
                    type: "session.update",
                    session: {
                        input_audio_format: "pcm",
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

                while (this.bufferQueue.length > 0) {
                    const data = this.bufferQueue.shift();
                    this.sendAudio(data);
                }
            });

            this.ws.on('message', (data) => {
                this.petWatchdog(); // Reset watchdog on any activity
                try {
                    const msg = JSON.parse(data.toString());
                    this.handleMessage(msg);
                } catch (e) {
                }
            });

            this.ws.on('error', (err) => {
                logger.error(`[DashScope] WebSocket Error: ${err.message}`);
                // Don't call onError immediately updates, let close handler decide on reconnect
            });

            this.ws.on('close', (code, reason) => {
                logger.info(`[DashScope] Closed: ${code} ${reason}`);
                this.cleanup();

                // Auto-reconnect if not manually stopped and within limits
                if (code !== 1000 && this.reconnectAttempts < this.maxReconnectAttempts) {
                    this.reconnectAttempts++;
                    const delay = Math.min(1000 * this.reconnectAttempts, 5000);
                    logger.info(`[DashScope] Reconnecting in ${delay}ms...`);
                    setTimeout(() => this.start(), delay);
                } else if (this.reconnectAttempts >= this.maxReconnectAttempts) {
                    logger.error('[DashScope] Max reconnect attempts reached');
                    this.onError && this.onError("连接云端服务失败，请检查网络或重启应用");
                }
            });
        } catch (e) {
            logger.error(`[DashScope] Init Error: ${e.message}`);
            this.onError && this.onError(e.message);
        }
    }

    startHeartbeat() {
        this.stopHeartbeat();
        // Send a ping every 15s to keep connection alive
        this.pingInterval = setInterval(() => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.ping();
            }
        }, 15000); // 15s ping

        this.petWatchdog();
    }

    stopHeartbeat() {
        if (this.pingInterval) clearInterval(this.pingInterval);
        if (this.watchdogTimer) clearTimeout(this.watchdogTimer);
        this.pingInterval = null;
        this.watchdogTimer = null;
    }

    petWatchdog() {
        if (this.watchdogTimer) clearTimeout(this.watchdogTimer);
        // If no message received for 20s, consider it dead
        this.watchdogTimer = setTimeout(() => {
            logger.warn('[DashScope] Connection timed out (Watchdog)');
            if (this.ws) this.ws.terminate(); // Force close to trigger reconnect logic
        }, 20000);
    }

    cleanup() {
        this.isReady = false;
        this.stopHeartbeat();
        // Note: bufferQueue is NOT cleared on reconnect attempts to preserve audio
    }

    handleMessage(msg) {
        const type = msg.type;

        if (type === 'session.updated') {
            logger.info('[DashScope] Session Configured Successfully');
        } else if (type === 'error') {
            logger.error(`[DashScope] Server Error: ${JSON.stringify(msg.error)}`);
            // Server error might be fatal or transient. 
            // If fatal (e.g. auth failed), we should probably stop.
            // For now, allow retry logic to handle it if connection drops.
        } else if (type === 'conversation.item.input_audio_transcription.completed') {
            if (msg.transcript) {
                this.onText(msg.transcript, true);
            }
        } else if (type === 'conversation.item.input_audio_transcription.failed') {
            logger.error(`[DashScope] Transcription Failed: ${JSON.stringify(msg.error)}`);
        } else if (type === 'response.audio_transcript.delta') {
            if (msg.delta) {
                this.onText(msg.delta, false);
            }
        }
    }

    sendAudio(buffer) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            // Queue if connecting, drop if closed/failed
            if (!this.ws || this.ws.readyState === WebSocket.CONNECTING) {
                this.bufferQueue.push(buffer);
            }
            return;
        }

        try {
            const base64Audio = buffer.toString('base64');
            const event = {
                type: "input_audio_buffer.append",
                audio: base64Audio
            };
            this.ws.send(JSON.stringify(event));
        } catch (e) {
            logger.error(`[DashScope] Send Error: ${e.message}`);
        }
    }

    flush() {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        try {
            logger.debug('[DashScope] Sending input_audio_buffer.commit...');
            const event = {
                type: "input_audio_buffer.commit"
            };
            this.ws.send(JSON.stringify(event));
        } catch (e) {
            logger.error(`[DashScope] Flush Error: ${e.message}`);
        }
    }

    stop() {
        this.reconnectAttempts = 0; // Manual stop resets retry counter
        this.cleanup();
        if (this.ws) {
            // Normal closure
            this.ws.close(1000, "Client Stoped");
            this.ws = null;
        }
        this.bufferQueue = [];
    }
}

module.exports = DashScopeClient;
