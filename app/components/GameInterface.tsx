'use client';

import { useState, useEffect } from 'react';
import { useGameStore } from '@/app/store/gameStore';
import { RefreshCw, Mic, ChevronRight, X, Skull, HeartPulse, Crown, MessageSquare, MicOff, BrainCircuit, Shield, Crosshair, Target } from 'lucide-react';
import clsx from 'clsx';
import PlayerCard from './PlayerCard';
import GameLog from './GameLog';
import { GamePhase } from '@/app/types/game';
import { analyzeGameState, startSpeechRecognition, stopSpeechRecognition } from '@/app/services/aiService';

const PHASE_ORDER: GamePhase[] = [
    'NIGHT_START',
    'WEREWOLF_ACTION',
    'SEER_ACTION',
    'WITCH_ACTION',
    'HUNTER_ACTION',
    'DAY_START',
    'DEATH_ANNOUNCE',
    'ELECTION',
    'SPEECH',
    'VOTE',
    'EXILE_SPEECH',
];

const PHASE_NAMES: Record<GamePhase, string> = {
    SETUP: '设置',
    NIGHT_START: '入夜',
    WEREWOLF_ACTION: '狼人行动',
    SEER_ACTION: '预言家',
    WITCH_ACTION: '女巫',
    HUNTER_ACTION: '猎人',
    DAY_START: '天亮',
    DEATH_ANNOUNCE: '宣布死讯',
    ELECTION: '竞选警长',
    SPEECH: '发言',
    VOTE: '放逐投票',
    EXILE_SPEECH: '遗言',
    GAME_OVER: '游戏结束',
};

export default function GameInterface() {
    const gameState = useGameStore();
    const { phase, players, day, myPlayerId, resetGame, setPhase, killPlayer, revivePlayer, setSheriff, addLog, toggleTeammateMark, setPlayerMark, updateProbabilities } = gameState;
    const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
    const [isRecording, setIsRecording] = useState(false);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [aiAnalysis, setAiAnalysis] = useState<string>('');
    const [wolfProbabilities, setWolfProbabilities] = useState<Record<string, number>>({});
    const [winRate, setWinRate] = useState<number>(50);
    const [dangerAlert, setDangerAlert] = useState<string | null>(null);

    // Audio detection states
    const [audioLevel, setAudioLevel] = useState<number>(0);
    const [isAudioDetected, setIsAudioDetected] = useState(false);
    const [liveTranscript, setLiveTranscript] = useState<string>('');
    const [recordingDuration, setRecordingDuration] = useState<number>(0);

    // Microphone permission states
    const [micPermission, setMicPermission] = useState<'granted' | 'denied' | 'prompt' | 'unsupported' | 'checking'>('checking');
    const [showPermissionPrompt, setShowPermissionPrompt] = useState(false);



    // Track who we are recording separately from the selected player (modal)
    // This allows us to close the modal while recording continues
    const [recordingTargetId, setRecordingTargetId] = useState<string | null>(null);

    const selectedPlayer = players.find(p => p.id === selectedPlayerId);

    // Auto-Analyze on Phase Change
    useEffect(() => {
        const runAnalysis = async () => {
            setIsAnalyzing(true);
            const result = await analyzeGameState(gameState);
            setAiAnalysis(result.analysis);
            setWolfProbabilities(result.probabilities);
            setWinRate(result.winRate);
            setDangerAlert(result.dangerAlert);
            updateProbabilities(result.roleProbabilities); // Update detailed stats in store
            setIsAnalyzing(false);
        };
        runAnalysis();
    }, [phase, day, players.length]); // Re-run on major changes (removed players dependency to avoid loops if players update triggers this)

    // Check microphone permission AND pre-warm Audio Engine on mount
    useEffect(() => {
        const checkPermissionAndInit = async () => {
            const { checkMicrophonePermission } = await import('@/app/services/aiService');
            const { initAudioEngine } = await import('@/app/services/voskService');

            // 1. Kick off Audio Engine Init (Background)
            // We don't await this immediately to keep UI responsive, but it starts the worklet loading.
            initAudioEngine().catch(err => console.error("Audio Engine Pre-warm failed:", err));

            // 2. Check Permissions
            const status = await checkMicrophonePermission();
            setMicPermission(status as any);

            // Show prompt if permission is needed
            if (status === 'prompt' || status === 'denied') {
                setShowPermissionPrompt(true);
            }
        };

        checkPermissionAndInit();
    }, []);

    const handleNextPhase = () => {
        const currentIndex = PHASE_ORDER.indexOf(phase);
        if (currentIndex >= 0 && currentIndex < PHASE_ORDER.length - 1) {
            setPhase(PHASE_ORDER[currentIndex + 1]);
        } else if (currentIndex === PHASE_ORDER.length - 1) {
            setPhase('NIGHT_START');
        }
    };

    const handleAction = async (
        action: 'KILL' | 'REVIVE' | 'SHERIFF' | 'SHERIFF_LOST' | 'RECORD' | 'MARK_TEAMMATE' | 'MARK_ROLE' | 'TOGGLE_TAG' | 'SELF_DESTRUCT' | 'ADD_RELATION',
        payload?: any,
        targetId?: string // Optional target ID to override selectedPlayerId
    ) => {
        const id = targetId || selectedPlayerId;
        if (!id) return;

        // If recording someone else and starting a new record, stop the old one first?
        // For simplicity, if we are recording and switch targets, we just stop the current one (which is handled by isRecording logic below for same target).
        // If target is different, we might need to be careful.
        // Let's assume if isRecording is true, we stop recording regardless of target for now, or just block?
        // Better:
        if (action === 'RECORD') {
            if (isRecording) {
                // Stop recording
                setIsRecording(false);
                setRecordingTargetId(null);
                stopSpeechRecognition();
                setLiveTranscript('');
                setAudioLevel(0);
                setIsAudioDetected(false);
                setRecordingDuration(0);
                // const text = await transcribeAudio(new Blob([]));
                // addLog('SPEECH', text, selectedPlayerId);
                // If we are stopping, generate log for the *active* recording player
                // We need to know who that was.
                // Let's assume `selectedPlayerId` holds the recording player if isRecording is true.
                if (recordingTargetId) {
                    // const text = await transcribeAudio(new Blob([]));
                    // addLog('SPEECH', text, selectedPlayerId);
                }

                // If we clicked a *different* player to start recording, we should probably start recording them after stopping?
                // But the current logic is a toggle.
                // Let's keep it simple: Click record -> Toggle recording for THAT player.
                // If recording is active for Player A, and we click Player B's mic:
                // 1. Stop Player A (save log).
                // 2. Start Player B.

                if (targetId && recordingTargetId && targetId !== recordingTargetId) {
                    // We stopped previous, now start new
                    // Wait a tick for cleanup? Or just start.
                    // Let's just fall through to start if we can... 
                    // But we used return logic.
                    // Let's handle switching targets explicitly if needed.
                    // For now, simple toggle: Stop current. User clicks again to start new.
                } else {
                    // We just toggled off (or on if it was same player)
                    // If it was same player, we just stopped.
                    // If we weren't recording, we start.
                }
            } else {
                // Start recording
                if (targetId) setSelectedPlayerId(targetId);
                const activePlayerId = targetId || selectedPlayerId;
                if (activePlayerId) {
                    setIsRecording(true);
                    setRecordingTargetId(activePlayerId);
                    // Close the modal so the visualizer is visible!
                    setSelectedPlayerId(null);

                    setLiveTranscript('');
                    setRecordingDuration(0);

                    const source = (activePlayerId === myPlayerId) ? 'MICROPHONE' : 'SYSTEM';

                    startSpeechRecognition(
                        source,
                        (text) => {
                            // Update live transcript
                            setLiveTranscript(prev => prev + ' ' + text);
                            setIsAudioDetected(true);
                            // Add to log
                            addLog('SPEECH', text, activePlayerId);
                        },
                        (err) => {
                            // 'network' error is expected in Electron, use warn.
                            if (err === 'network' || err === 'not-allowed' || err === 'service-not-allowed') {
                                console.warn("[Audio] Speech Recognition (Network/Service) unavailable:", err);
                                setLiveTranscript('(语音转文字服务不可用，但麦克风正常工作)');
                            } else {
                                console.error("Speech Recognition Error:", err);
                                setLiveTranscript(`(错误: ${err})`);
                            }

                            // We deliberately do NOT call setIsRecording(false) here, 
                            // to keep the audio level meter functionality alive.
                        },
                        (level) => {
                            // Update audio level
                            setAudioLevel(level);
                            if (level > 5) {
                                setIsAudioDetected(true);
                            }
                        }
                    );
                }
            }
            return;
        }

        switch (action) {
            case 'KILL':
                killPlayer(id);
                break;
            case 'REVIVE':
                revivePlayer(id);
                break;
            case 'SHERIFF':
                if (gameState.sheriffId) {
                    // If sheriff exists, this is a transfer
                    gameState.transferSheriff(id);
                } else {
                    setSheriff(id);
                }
                break;
            case 'SHERIFF_LOST':
                gameState.transferSheriff(null);
                break;
            case 'SELF_DESTRUCT':
                gameState.wolfSelfDestruct(id);
                break;
            case 'ADD_RELATION':
                if (payload && payload.type && payload.sourceId) {
                    gameState.addRelation(payload.type, payload.sourceId, id); // id is target
                }
                break;
            case 'MARK_TEAMMATE':
                toggleTeammateMark(id);
                break;
            case 'MARK_ROLE':
                setPlayerMark(id, payload);
                break;
            case 'TOGGLE_TAG':
                gameState.togglePlayerTag(id, payload);
                break;
        }
        if (!isRecording) setSelectedPlayerId(null);
    };

    // Handle microphone permission request
    const handleRequestPermission = async () => {
        const { requestMicrophonePermission } = await import('@/app/services/aiService');
        const granted = await requestMicrophonePermission();

        if (granted) {
            setMicPermission('granted');
            setShowPermissionPrompt(false);
        } else {
            setMicPermission('denied');
        }
    };

    return (
        <div className="flex flex-col h-screen max-w-6xl mx-auto p-4 md:p-6 gap-6 relative">
            {/* Top Bar */}
            <header className="flex items-center justify-between turbo-card p-4 shrink-0">
                <div className="flex items-center gap-4">
                    <div className="bg-violet-600/20 text-violet-400 px-3 py-1 rounded text-sm font-bold border border-violet-600/50">
                        第 {day} 天
                    </div>
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                        {PHASE_NAMES[phase] || phase}
                        <span className="text-xs text-slate-500 font-normal ml-2 hidden md:inline-block">({phase})</span>
                    </h2>
                </div>

                <div className="flex gap-2 items-center">
                    <button onClick={resetGame} className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-red-400 transition-colors" title="重置对局">
                        <RefreshCw size={20} />
                    </button>
                </div>
            </header>

            {/* Main Game Area */}
            <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6 overflow-hidden min-h-0">

                {/* Left: Player Grid (2/3 width) */}
                <div className="lg:col-span-2 turbo-card p-6 overflow-y-auto min-h-0">
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-4">
                        {players.map(player => {
                            const lastLog = gameState.logs
                                .filter(l => l.sourcePlayerId === player.id && l.type === 'SPEECH')
                                .sort((a, b) => b.timestamp - a.timestamp)[0];

                            return (
                                <div key={player.id} className="relative">
                                    <PlayerCard
                                        player={player}
                                        isMe={player.id === myPlayerId}
                                        onClick={() => setSelectedPlayerId(player.id)}
                                        latestSpeech={lastLog?.message}
                                        onQuickRecord={(e) => handleAction('RECORD', undefined, player.id)}
                                        isRecording={isRecording && recordingTargetId === player.id}
                                        relations={gameState.relations?.map(r => ({
                                            ...r,
                                            sourceNumber: players.find(p => p.id === r.sourceId)?.number
                                        }))}
                                    />
                                    {/* Wolf Probability Badge - REMOVED here, moved to PlayerCard or kept simple? 
                                        Let's keep the simple badge for top level view, but maybe use the new probabilities?
                                        Actually plan says "Update probability display to accept a list".
                                        We should delegate this to PlayerCard to handle the complex list.
                                    */}
                                </div>
                            );
                        })}
                    </div>

                    {/* Audio Detection & Live Transcript Panel */}
                    {isRecording && (
                        <div className="mt-4 p-4 bg-slate-900/50 rounded-lg border border-violet-600/30">
                            <div className="flex items-center gap-3 mb-3">
                                <div className="flex items-center gap-2">
                                    <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
                                    <span className="text-sm font-bold text-white">正在录音</span>
                                </div>
                                {isAudioDetected && (
                                    <div className="flex items-center gap-2 text-green-400 text-xs">
                                        <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                                        <span>检测到音频</span>
                                    </div>
                                )}
                            </div>

                            {/* Audio Level Indicator */}
                            <div className="mb-3">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="text-xs text-slate-400">音量:</span>
                                    <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-gradient-to-r from-green-500 via-yellow-500 to-red-500 transition-all duration-100"
                                            style={{ width: `${audioLevel}%` }}
                                        />
                                    </div>
                                    <span className="text-xs text-slate-400 w-10 text-right">{audioLevel}%</span>
                                </div>
                            </div>

                            {/* Live Transcript */}
                            <div className="bg-slate-950/50 p-3 rounded border border-slate-700 min-h-[60px]">
                                <div className="text-xs text-slate-500 mb-1">实时转录:</div>
                                <div className="text-sm text-white">
                                    {liveTranscript || <span className="text-slate-600 italic">等待语音输入...</span>}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Right: Info & Controls */}
                <div className="flex flex-col gap-4 overflow-hidden h-full min-h-0">

                    {/* AI Analysis Panel */}
                    <div className="turbo-card p-4 shrink-0 flex flex-col gap-2 max-h-[30vh] overflow-y-auto">
                        <div className="flex justify-between items-center sticky top-0 bg-slate-900/90 pb-2 z-10 border-b border-slate-800 mb-2">
                            <h3 className="text-sm font-bold text-violet-400 flex items-center gap-2">
                                <BrainCircuit size={16} />
                                AI 局势分析
                                {isAnalyzing && <span className="text-xs text-slate-500 animate-pulse">思考中...</span>}
                            </h3>
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-slate-400">胜率预测</span>
                                <div className="h-2 w-16 bg-slate-700 rounded-full overflow-hidden">
                                    <div
                                        className={clsx("h-full transition-all duration-1000",
                                            winRate > 60 ? "bg-green-500" :
                                                winRate < 40 ? "bg-red-500" : "bg-amber-500"
                                        )}
                                        style={{ width: `${winRate}%` }}
                                    />
                                </div>
                                <span className={clsx("text-xs font-bold",
                                    winRate > 60 ? "text-green-400" :
                                        winRate < 40 ? "text-red-400" : "text-amber-400"
                                )}>{winRate}%</span>
                            </div>
                        </div>

                        {dangerAlert && (
                            <div className="bg-red-950/50 border border-red-500/30 text-red-200 text-xs p-2 rounded animate-pulse flex items-center gap-2">
                                <Shield size={14} className="text-red-500" />
                                {dangerAlert}
                            </div>
                        )}

                        <p className="text-sm text-slate-300 whitespace-pre-line leading-relaxed">
                            {aiAnalysis || "等待游戏数据..."}
                        </p>
                    </div>

                    {/* Logs Area */}
                    <div className="turbo-card p-4 flex-1 flex flex-col min-h-0">
                        <h3 className="text-sm font-bold text-cyan-400 mb-2 border-b border-slate-800 pb-2 shrink-0">
                            对局记录
                        </h3>
                        <GameLog />
                    </div>

                    {/* Controls Area */}
                    <div className="turbo-card p-4 shrink-0">
                        <button
                            onClick={handleNextPhase}
                            className="w-full turbo-btn-primary flex items-center justify-center gap-2 py-3"
                        >
                            进入下一阶段 <ChevronRight size={18} />
                        </button>
                    </div>
                </div>
            </div>

            {/* Player Action Modal (Simple Overlay) */}
            {selectedPlayer && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <div className="turbo-card w-full max-w-sm p-6 space-y-6 animate-in fade-in zoom-in duration-200">
                        <div className="flex justify-between items-center border-b border-slate-800 pb-4">
                            <h3 className="text-xl font-bold text-white">
                                玩家 {selectedPlayer.number}
                                {selectedPlayer.id === myPlayerId && <span className="ml-2 text-sm text-violet-400">(我)</span>}
                            </h3>
                            <button
                                onClick={() => {
                                    if (!isRecording) setSelectedPlayerId(null);
                                }}
                                className="text-slate-400 hover:text-white"
                                disabled={isRecording}
                            >
                                <X size={24} />
                            </button>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <button
                                onClick={() => handleAction('KILL')}
                                className="flex flex-col items-center justify-center p-4 bg-slate-800 hover:bg-slate-700 rounded-xl gap-2 text-red-400 transition-colors"
                                disabled={selectedPlayer.status === 'DEAD'}
                            >
                                <Skull size={24} />
                                <span className="text-sm font-bold">标记死亡/放逐</span>
                            </button>

                            <button
                                onClick={() => handleAction('REVIVE')}
                                className="flex flex-col items-center justify-center p-4 bg-slate-800 hover:bg-slate-700 rounded-xl gap-2 text-green-400 transition-colors"
                                disabled={selectedPlayer.status === 'ALIVE'}
                            >
                                <HeartPulse size={24} />
                                <span className="text-sm font-bold">复活/救人</span>
                            </button>

                            <button
                                onClick={() => handleAction('SHERIFF')}
                                className="flex flex-col items-center justify-center p-4 bg-slate-800 hover:bg-slate-700 rounded-xl gap-2 text-amber-400 transition-colors"
                            >
                                <Crown size={24} />
                                <span className="text-sm font-bold">当选警长</span>
                            </button>

                            {/* Record Button REMOVED as per user request (Duplicate of Quick Record on card) 
                            <button
                                onClick={() => handleAction('RECORD')}
                                className={clsx(
                                    "flex flex-col items-center justify-center p-4 rounded-xl gap-2 transition-all",
                                    isRecording
                                        ? "bg-red-500/20 text-red-500 animate-pulse border border-red-500/50"
                                        : "bg-slate-800 hover:bg-slate-700 text-cyan-400"
                                )}
                            >
                                {isRecording ? <MicOff size={24} /> : <Mic size={24} />}
                                <span className="text-sm font-bold">{isRecording ? '停止录音' : '录制发言'}</span>
                            </button> 
                            */}

                            {/* Mark Teammate (Only for Wolves) */}
                            {['WEREWOLF', 'WOLF_KING', 'BEAUTY_WOLF'].includes(players.find(p => p.id === myPlayerId)?.role || '') && selectedPlayerId !== myPlayerId && (
                                <button
                                    onClick={() => handleAction('MARK_TEAMMATE')}
                                    className={clsx(
                                        "flex flex-col items-center justify-center p-4 rounded-xl gap-2 transition-all col-span-2",
                                        selectedPlayer.isMarkedTeammate
                                            ? "bg-red-900/40 text-red-400 border border-red-800"
                                            : "bg-slate-800 hover:bg-slate-700 text-slate-400"
                                    )}
                                >
                                    <Skull size={24} className={selectedPlayer.isMarkedTeammate ? "fill-current" : ""} />
                                    <span className="text-sm font-bold">
                                        {selectedPlayer.isMarkedTeammate ? '取消狼队友标记' : '标记为狼队友'}
                                    </span>
                                </button>
                            )}

                            {/* Seer Marks */}
                            {players.find(p => p.id === myPlayerId)?.role === 'SEER' && selectedPlayerId !== myPlayerId && (
                                <div className="col-span-2 grid grid-cols-2 gap-3 pt-2 border-t border-slate-800">
                                    <button
                                        onClick={() => handleAction('MARK_ROLE', 'BAD')}
                                        className={clsx(
                                            "flex items-center justify-center p-3 rounded-xl gap-2 transition-all font-bold text-sm",
                                            selectedPlayer.markedRole === 'BAD' ? "bg-red-500 text-white" : "bg-slate-800 text-red-400 hover:bg-slate-700"
                                        )}
                                    >
                                        查杀 (狼)
                                    </button>
                                    <button
                                        onClick={() => handleAction('MARK_ROLE', 'GOOD')}
                                        className={clsx(
                                            "flex items-center justify-center p-3 rounded-xl gap-2 transition-all font-bold text-sm",
                                            selectedPlayer.markedRole === 'GOOD' ? "bg-green-500 text-white" : "bg-slate-800 text-green-400 hover:bg-slate-700"
                                        )}
                                    >
                                        金水 (好)
                                    </button>
                                </div>
                            )}

                            {/* Witch Marks */}
                            {players.find(p => p.id === myPlayerId)?.role === 'WITCH' && selectedPlayerId !== myPlayerId && (
                                <div className="col-span-2 pt-2 border-t border-slate-800">
                                    <button
                                        onClick={() => handleAction('MARK_ROLE', selectedPlayer.markedRole === 'SILVER' ? null : 'SILVER')}
                                        className={clsx(
                                            "flex items-center justify-center w-full p-3 rounded-xl gap-2 transition-all font-bold text-sm",
                                            selectedPlayer.markedRole === 'SILVER' ? "bg-slate-200 text-slate-900" : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                                        )}
                                    >
                                        {selectedPlayer.markedRole === 'SILVER' ? '取消银水标记' : '标记为银水'}
                                    </button>
                                </div>
                            )}

                            {/* Guard Marks */}
                            {players.find(p => p.id === myPlayerId)?.role === 'GUARD' && selectedPlayerId !== myPlayerId && (
                                <div className="col-span-2 pt-2 border-t border-slate-800">
                                    <button
                                        onClick={() => handleAction('MARK_ROLE', selectedPlayer.markedRole === 'PROTECT' ? null : 'PROTECT')}
                                        className={clsx(
                                            "flex items-center justify-center w-full p-3 rounded-xl gap-2 transition-all font-bold text-sm",
                                            selectedPlayer.markedRole === 'PROTECT' ? "bg-emerald-500 text-white" : "bg-slate-800 text-emerald-400 hover:bg-slate-700"
                                        )}
                                    >
                                        <Shield size={18} className="mr-2" />
                                        {selectedPlayer.markedRole === 'PROTECT' ? '取消守护标记' : '标记守护'}
                                    </button>
                                </div>
                            )}

                            {/* Gun Actions (Hunter / Wolf King) */}
                            {/* Available to everyone for manual control, or restrict if needed. Let's make it available to "God" (User) */}
                            <div className="col-span-2 pt-2 border-t border-slate-800 grid grid-cols-2 gap-3">
                                <button
                                    onClick={() => handleAction('TOGGLE_TAG', 'SHOOTER')}
                                    className={clsx(
                                        "flex items-center justify-center p-3 rounded-xl gap-2 transition-all font-bold text-sm",
                                        selectedPlayer.tags?.includes('SHOOTER') ? "bg-amber-600 text-white" : "bg-slate-800 text-amber-500 hover:bg-slate-700"
                                    )}
                                >
                                    <Crosshair size={18} />
                                    {selectedPlayer.tags?.includes('SHOOTER') ? '取消开枪标记' : '标记开枪'}
                                </button>
                                <button
                                    onClick={() => handleAction('TOGGLE_TAG', 'SHOT_DEAD')}
                                    className={clsx(
                                        "flex items-center justify-center p-3 rounded-xl gap-2 transition-all font-bold text-sm",
                                        selectedPlayer.tags?.includes('SHOT_DEAD') ? "bg-red-600 text-white" : "bg-slate-800 text-red-500 hover:bg-slate-700"
                                    )}
                                >
                                    <Target size={18} />
                                    {selectedPlayer.tags?.includes('SHOT_DEAD') ? '取消带走标记' : '标记被带走'}
                                </button>
                            </div>
                        </div>

                        {/* Wolf Actions (Suicide) */}
                        {selectedPlayer.status === 'ALIVE' && (
                            <div className="col-span-2 pt-2 border-t border-slate-800">
                                <button
                                    onClick={() => {
                                        if (confirm(`确定要让玩家 ${selectedPlayer.number} 自爆吗？这将直接进入入夜阶段。`)) {
                                            handleAction('SELF_DESTRUCT');
                                        }
                                    }}
                                    className="flex items-center justify-center w-full p-3 rounded-xl gap-2 transition-all font-bold text-sm bg-slate-800 text-red-500 hover:bg-red-900/20 hover:text-red-400"
                                >
                                    <Skull size={18} />
                                    狼人自爆 (直接入夜)
                                </button>
                            </div>
                        )}

                        {/* Sheriff Transfer (Only if Sheriff is dead or I am Sheriff) */}
                        {/* Actually anyone can operate in this app as God, but let's show it if sheriffId exists and it's not selected player? No, if selected player IS target. */}
                        {/* Logic: If there is a Sheriff, and we select another player, show "Hand over Badge". */}
                        {/* If we select the Sheriff, show "Badge Lost". */}
                        {gameState.sheriffId && (
                            <div className="col-span-2 pt-2 border-t border-slate-800 grid grid-cols-1 gap-2">
                                {gameState.sheriffId === selectedPlayerId ? (
                                    <button
                                        onClick={() => handleAction('SHERIFF_LOST')}
                                        className="flex items-center justify-center p-3 rounded-xl gap-2 transition-all font-bold text-sm bg-slate-800 text-slate-400 hover:bg-slate-700"
                                    >
                                        <X size={18} />
                                        警徽流失
                                    </button>
                                ) : (
                                    <button
                                        onClick={() => handleAction('SHERIFF')}
                                        className="flex items-center justify-center p-3 rounded-xl gap-2 transition-all font-bold text-sm bg-slate-800 text-amber-500 hover:bg-slate-700"
                                    >
                                        <Crown size={18} />
                                        移交警徽给他
                                    </button>
                                )}
                            </div>
                        )}

                        {/* Relations: Shooter -> Victim */}
                        {/* If selected player is marked as SHOOTER, we need a way to say WHO they shot. */}
                        {/* Implementation: If I am looking at Player B, and Player A is tagged SHOOTER, maybe show "Player A shot this guy"? */}
                        {/* Better: If selected player is ANYONE, show "Mark as Shot by..." list of Shooters? */}
                        {players.some(p => p.tags?.includes('SHOOTER')) && (
                            <div className="col-span-2 pt-2 border-t border-slate-800">
                                <label className="text-xs text-slate-500 block mb-2">标记枪击关系 (谁带走了他?)</label>
                                <div className="flex flex-wrap gap-2">
                                    {players.filter(p => p.tags?.includes('SHOOTER')).map(shooter => (
                                        <button
                                            key={shooter.id}
                                            onClick={() => handleAction('ADD_RELATION', { type: 'SHOOT', sourceId: shooter.id })}
                                            className="px-3 py-2 bg-slate-800 rounded-lg text-xs text-amber-500 hover:bg-slate-700 flex items-center gap-1"
                                            disabled={selectedPlayerId === shooter.id}
                                        >
                                            <Crosshair size={12} />
                                            {shooter.number}号开枪带走
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Microphone Permission Request Modal */}
            {showPermissionPrompt && micPermission !== 'granted' && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in">
                    <div className="bg-slate-900 border-2 border-violet-600/50 rounded-2xl p-8 max-w-md mx-4 shadow-2xl animate-in zoom-in-95 duration-300">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-12 h-12 bg-violet-600/20 rounded-full flex items-center justify-center">
                                <Mic className="text-violet-400" size={24} />
                            </div>
                            <h3 className="text-xl font-bold text-white">需要麦克风权限</h3>
                        </div>

                        <p className="text-slate-300 mb-6 leading-relaxed">
                            为了使用语音识别功能，应用需要访问您的麦克风。
                            {micPermission === 'denied' && (
                                <span className="block mt-2 text-red-400 text-sm">
                                    ⚠️ 您之前拒绝了麦克风权限，请在浏览器设置中手动允许。
                                </span>
                            )}
                        </p>

                        <div className="flex gap-3">
                            <button
                                onClick={handleRequestPermission}
                                className="flex-1 bg-violet-600 hover:bg-violet-700 text-white px-6 py-3 rounded-lg font-bold transition-colors flex items-center justify-center gap-2"
                                disabled={micPermission === 'denied'}
                            >
                                <Mic size={18} />
                                {micPermission === 'denied' ? '已拒绝' : '允许麦克风'}
                            </button>
                            <button
                                onClick={() => setShowPermissionPrompt(false)}
                                className="px-6 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg font-bold transition-colors"
                            >
                                稍后
                            </button>
                        </div>

                        {micPermission === 'unsupported' && (
                            <div className="mt-4 p-3 bg-red-900/20 border border-red-600/30 rounded-lg text-red-400 text-sm">
                                ⚠️ 您的浏览器不支持麦克风访问功能
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div >
    );
}
