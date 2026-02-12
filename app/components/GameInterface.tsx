'use client';

import { useState, useEffect, useRef } from 'react';
import { useGameStore } from '@/app/store/gameStore';
import { RefreshCw, Mic, ChevronRight, X, Skull, HeartPulse, Crown, MessageSquare, MicOff, BrainCircuit, Shield, Crosshair, Target } from 'lucide-react';
import clsx from 'clsx';
import PlayerCard from './PlayerCard';
import GameLog from './GameLog';
import VoteRecorder from './VoteRecorder';
import { GamePhase } from '@/app/types/game';
import { analyzeGameState, startSpeechRecognition, stopSpeechRecognition } from '@/app/services/aiService';

const PHASE_ORDER: GamePhase[] = [
    'NIGHT_START',
    'WEREWOLF_ACTION',
    'SEER_ACTION',
    'WITCH_ACTION',
    'HUNTER_ACTION',
    'DAY_START',
    'ELECTION',
    'DEATH_ANNOUNCE',
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
    const [speechFilterDay, setSpeechFilterDay] = useState<string>('ALL'); // For Modal Speech Filter
    const [editingLogId, setEditingLogId] = useState<string | null>(null); // For Speech Log Editing
    const [editText, setEditText] = useState<string>(''); // For Speech Log Editing
    const [confirmingRestoreId, setConfirmingRestoreId] = useState<string | null>(null); // For Restore Confirmation
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
    const liveTranscriptRef = useRef(''); // Ref to track latest transcript for async access

    // Sync ref
    useEffect(() => {
        liveTranscriptRef.current = liveTranscript;
    }, [liveTranscript]);

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
            const { prepareAudioEngine } = await import('@/app/services/voskService');

            // 1. Kick off Audio Engine Init (Background)
            // We don't await this immediately to keep UI responsive, but it starts the worklet loading.
            prepareAudioEngine().catch(err => console.error("Audio Engine Pre-warm failed:", err));

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

    const [isSaving, setIsSaving] = useState(false); // Block UI during flush

    const handleAction = async (
        action: 'KILL' | 'REVIVE' | 'SHERIFF' | 'SHERIFF_LOST' | 'RECORD' | 'MARK_TEAMMATE' | 'MARK_ROLE' | 'TOGGLE_TAG' | 'SELF_DESTRUCT' | 'ADD_RELATION' | 'TOGGLE_CAMPAIGN' | 'QUIT_ELECTION' | 'SET_MIXBLOOD_TARGET',
        payload?: any,
        targetId?: string // Optional target ID to override selectedPlayerId
    ) => {
        const id = targetId || selectedPlayerId;
        if (!id) return;

        // Prevent new actions while saving previous audio
        if (isSaving) return;

        // If recording someone else and starting a new record, stop the old one first?
        // For simplicity, if we are recording and switch targets, we just stop the current one (which is handled by isRecording logic below for same target).
        // If target is different, we might need to be careful.
        // Let's assume if isRecording is true, we stop recording regardless of target for now, or just block?
        // Better:
        if (action === 'RECORD') {
            if (isRecording) {
                // Stop recording
                setIsRecording(false); // Update UI immediately
                setIsSaving(true); // Block interactions

                // Wait for flush (async)
                await stopSpeechRecognition();

                // Consolidate transcript into one log entry
                // Uses Ref to get the very latest text updated during the flush wait
                const finalTranscript = liveTranscriptRef.current;

                if (finalTranscript && finalTranscript.trim()) {
                    const target = recordingTargetId || selectedPlayerId;
                    if (target) {
                        addLog('SPEECH', finalTranscript.trim(), target);
                    }
                }

                setRecordingTargetId(null);
                setLiveTranscript('');
                liveTranscriptRef.current = ''; // Reset ref too
                setAudioLevel(0);
                setIsAudioDetected(false);
                setRecordingDuration(0);
                setIsSaving(false); // Unblock interactions

                if (targetId && recordingTargetId && targetId !== recordingTargetId) {
                    // Start new logic if needed
                }
            } else {
                // Start recording
                if (targetId) setSelectedPlayerId(targetId);
                const activePlayerId = targetId || selectedPlayerId;
                if (activePlayerId) {
                    setIsRecording(true);
                    setRecordingTargetId(activePlayerId);
                    setSelectedPlayerId(null);
                    setLiveTranscript('');
                    setRecordingDuration(0);

                    const source = (activePlayerId === myPlayerId) ? 'MICROPHONE' : 'SYSTEM';

                    startSpeechRecognition(
                        source,
                        (text) => {
                            // Update live transcript ONLY
                            setLiveTranscript(prev => {
                                if (!prev) return text;
                                const lastChar = prev.trim().slice(-1);
                                const isPunctuation = ['。', '！', '？', '；', '.', '!', '?', ';'].includes(lastChar);
                                const separator = isPunctuation ? '' : '，';
                                return prev + separator + text;
                            });
                            setIsAudioDetected(true);
                        },
                        (err) => {
                            if (err === 'network' || err === 'not-allowed' || err === 'service-not-allowed') {
                                console.warn("[Audio] Speech Recognition unavailable:", err);
                                setLiveTranscript(prev => prev || '(语音服务不可用)');
                            } else {
                                console.error("Speech Recognition Error:", err);
                                setLiveTranscript(prev => prev + ` (错误: ${err})`);
                            }
                        },
                        (level) => {
                            setAudioLevel(level);
                            if (level > 5) setIsAudioDetected(true);
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
            case 'TOGGLE_CAMPAIGN':
                gameState.toggleCampaign(id);
                break;
            case 'QUIT_ELECTION':
                gameState.quitElection(id);
                break;
            case 'SET_MIXBLOOD_TARGET':
                gameState.setMixbloodTarget(id);
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
                    {/* ASR Status Badge */}
                    {gameState.asrState && (
                        <div className={clsx(
                            "hidden md:flex items-center gap-1.5 px-2 py-1 rounded text-xs font-bold border",
                            gameState.asrState.type === 'CLOUD'
                                ? "bg-green-500/10 text-green-400 border-green-500/30"
                                : "bg-yellow-500/10 text-yellow-400 border-yellow-500/30"
                        )} title={`正在使用: ${gameState.asrState.model}`}>
                            <div className={clsx(
                                "w-1.5 h-1.5 rounded-full",
                                gameState.asrState.type === 'CLOUD' ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]" : "bg-yellow-500"
                            )} />
                            {gameState.asrState.type === 'CLOUD' ? 'Qwen-ASR' : 'Vosk Local'}
                        </div>
                    )}

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
                                        // latestSpeech removed
                                        onQuickRecord={(e) => handleAction('RECORD', undefined, player.id)}
                                        onToggleCampaign={phase === 'ELECTION' ? (e) => handleAction('TOGGLE_CAMPAIGN', undefined, player.id) : undefined}
                                        onQuitElection={phase === 'ELECTION' ? (e) => handleAction('QUIT_ELECTION', undefined, player.id) : undefined}
                                        isRecording={isRecording && recordingTargetId === player.id}
                                        relations={gameState.relations?.map(r => ({
                                            ...r,
                                            sourceNumber: players.find(p => p.id === r.sourceId)?.number
                                        }))}
                                        isMixbloodTarget={players.find(p => p.id === myPlayerId)?.mixbloodTargetId === player.id}
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

                    {/* Logs Area / Vote Recorder */}
                    <div className="turbo-card p-4 flex-1 flex flex-col min-h-0">
                        {phase === 'VOTE' ? (
                            <VoteRecorder />
                        ) : (
                            <>
                                <h3 className="text-sm font-bold text-cyan-400 mb-2 border-b border-slate-800 pb-2 shrink-0">
                                    对局记录
                                </h3>
                                <GameLog />
                            </>
                        )}
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

            {/* Player Action Modal (Expanded) */}
            {selectedPlayer && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                    <div className="turbo-card w-full max-w-4xl max-h-[90vh] p-6 space-y-6 animate-in fade-in zoom-in duration-200 overflow-hidden flex flex-col">
                        <div className="flex justify-between items-center border-b border-slate-800 pb-4 shrink-0">
                            <h3 className="text-xl font-bold text-white flex items-center gap-2">
                                <span className="bg-slate-700 w-8 h-8 rounded-full flex items-center justify-center text-sm">{selectedPlayer.number}</span>
                                玩家操作面板
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

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 min-h-0 flex-1 overflow-hidden">
                            {/* Left: Actions */}
                            <div className="overflow-y-auto pr-2 space-y-6">
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

                                    {/* Mark Teammate (Only for Wolves) */}
                                    {['WEREWOLF', 'WOLF_KING', 'BEAUTY_WOLF'].includes(players.find(p => p.id === myPlayerId)?.role || '') && selectedPlayerId !== myPlayerId && (
                                        <button
                                            onClick={() => handleAction('MARK_TEAMMATE')}
                                            className={clsx(
                                                "flex flex-col items-center justify-center p-4 rounded-xl gap-2 transition-all col-span-2 md:col-span-1",
                                                selectedPlayer.isMarkedTeammate
                                                    ? "bg-red-900/40 text-red-400 border border-red-800"
                                                    : "bg-slate-800 hover:bg-slate-700 text-slate-400"
                                            )}
                                        >
                                            <Skull size={24} className={selectedPlayer.isMarkedTeammate ? "fill-current" : ""} />
                                            <span className="text-sm font-bold">
                                                {selectedPlayer.isMarkedTeammate ? '取消狼队友' : '标记狼队友'}
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

                                    {/* Gun Actions */}
                                    <div className="col-span-2 pt-2 border-t border-slate-800 grid grid-cols-2 gap-3">
                                        <button
                                            onClick={() => handleAction('TOGGLE_TAG', 'SHOOTER')}
                                            className={clsx(
                                                "flex items-center justify-center p-3 rounded-xl gap-2 transition-all font-bold text-sm",
                                                selectedPlayer.tags?.includes('SHOOTER') ? "bg-amber-600 text-white" : "bg-slate-800 text-amber-500 hover:bg-slate-700"
                                            )}
                                        >
                                            <Crosshair size={18} />
                                            {selectedPlayer.tags?.includes('SHOOTER') ? '取消开枪' : '标记开枪'}
                                        </button>
                                        <button
                                            onClick={() => handleAction('TOGGLE_TAG', 'SHOT_DEAD')}
                                            className={clsx(
                                                "flex items-center justify-center p-3 rounded-xl gap-2 transition-all font-bold text-sm",
                                                selectedPlayer.tags?.includes('SHOT_DEAD') ? "bg-red-600 text-white" : "bg-slate-800 text-red-500 hover:bg-slate-700"
                                            )}
                                        >
                                            <Target size={18} />
                                            {selectedPlayer.tags?.includes('SHOT_DEAD') ? '取消带走' : '标记被带走'}
                                        </button>
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
                                                狼人自爆
                                            </button>
                                        </div>
                                    )}

                                    {/* Sheriff Transfer Logic */}
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
                                </div>
                            </div>


                            {/* Right: Speech History */}
                            <div className="flex flex-col h-full bg-slate-900/50 rounded-xl border border-slate-800 overflow-hidden">
                                <div className="p-3 border-b border-slate-800 flex justify-between items-center bg-slate-900">
                                    <h4 className="text-sm font-bold text-slate-300 flex items-center gap-2">
                                        <MessageSquare size={16} />
                                        发言记录
                                    </h4>
                                    <select
                                        className="bg-slate-800 text-slate-300 text-xs rounded border border-slate-700 px-2 py-1 outline-none focus:border-violet-500"
                                        onChange={(e) => {
                                            // Handle filter change (Local state needed, but inline for now I need to declare state in component)
                                            // Since I can't add state inside this conditional render block easily without remounting, 
                                            // I should probably add state to the main component.
                                            // For now, let's assume I added `speechFilterDay` state to GameInterface.
                                            // I will add it using `useState` in the main body.
                                            setSpeechFilterDay(e.target.value);
                                        }}
                                        value={speechFilterDay}
                                    >
                                        <option value="ALL">全部环节</option>
                                        {Array.from(new Set(gameState.logs.filter(l => l.sourcePlayerId === selectedPlayerId && l.type === 'SPEECH').map(l => l.day)))
                                            .sort((a, b) => a - b)
                                            .map(d => (
                                                <option key={d} value={d.toString()}>第 {d} 天</option>
                                            ))
                                        }
                                    </select>
                                </div>
                                <div className="flex-1 overflow-y-auto p-3 space-y-3">
                                    {gameState.logs
                                        .filter(l => l.sourcePlayerId === selectedPlayerId && l.type === 'SPEECH')
                                        .filter(l => speechFilterDay === 'ALL' || l.day === parseInt(speechFilterDay))
                                        .sort((a, b) => b.timestamp - a.timestamp) // Newest first
                                        .map(log => (
                                            <div key={log.id} className="bg-slate-800/80 p-3 rounded-lg border border-slate-700 group hover:border-slate-600 transition-colors">
                                                <div className="flex justify-between items-center mb-1">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-[10px] text-slate-500 px-1.5 py-0.5 bg-slate-900 rounded border border-slate-800">
                                                            第{log.day}天 - {PHASE_NAMES[log.phase]}
                                                        </span>
                                                        {log.originalMessage && (
                                                            <span className="text-[10px] text-amber-500/50 italic px-1" title="此条目已修改">
                                                                (已编辑)
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-[10px] text-slate-600">
                                                            {new Date(log.timestamp).toLocaleTimeString()}
                                                        </span>

                                                        {/* Restore Button (Visible if original exists and NOT editing, AND content is different) */}
                                                        {log.originalMessage && log.message !== log.originalMessage && editingLogId !== log.id && (
                                                            <button
                                                                onClick={() => {
                                                                    if (confirmingRestoreId === log.id) {
                                                                        gameState.updateLog(log.id, log.originalMessage!);
                                                                        setConfirmingRestoreId(null);
                                                                    } else {
                                                                        setConfirmingRestoreId(log.id);
                                                                    }
                                                                }}
                                                                onMouseLeave={() => setConfirmingRestoreId(null)}
                                                                className={clsx(
                                                                    "opacity-0 group-hover:opacity-100 px-2 py-0.5 text-[10px] rounded transition-all flex items-center gap-1",
                                                                    confirmingRestoreId === log.id
                                                                        ? "opacity-100 bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/50"
                                                                        : "bg-slate-700/50 text-slate-400 hover:text-amber-400 hover:bg-slate-700"
                                                                )}
                                                                title={confirmingRestoreId === log.id ? "点击确认还原" : "还原原始语音"}
                                                            >
                                                                <RefreshCw size={10} className={confirmingRestoreId === log.id ? "animate-spin" : ""} />
                                                                {confirmingRestoreId === log.id ? "确认?" : "还原"}
                                                            </button>
                                                        )}

                                                        {/* Edit Button (Visible on Hover or if Editing) */}
                                                        {editingLogId !== log.id && (
                                                            <button
                                                                onClick={() => {
                                                                    setEditingLogId(log.id);
                                                                    setEditText(log.message);
                                                                    setConfirmingRestoreId(null);
                                                                }}
                                                                className="opacity-0 group-hover:opacity-100 px-2 py-0.5 text-[10px] bg-slate-700 hover:bg-violet-600 text-slate-300 hover:text-white rounded transition-all"
                                                            >
                                                                编辑
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>

                                                {editingLogId === log.id ? (
                                                    <div className="animate-in fade-in duration-200">
                                                        <textarea
                                                            value={editText}
                                                            onChange={(e) => setEditText(e.target.value)}
                                                            className="w-full bg-slate-900 text-slate-200 text-sm p-3 rounded border border-violet-500/50 outline-none focus:ring-1 focus:ring-violet-500 min-h-[300px] leading-relaxed mb-3 font-mono resize-y"
                                                            placeholder="输入修改后的发言内容..."
                                                            autoFocus
                                                        />
                                                        <div className="flex justify-end gap-2 text-xs items-center">
                                                            <button
                                                                onClick={() => setEditingLogId(null)}
                                                                className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 rounded text-slate-300 transition-colors border border-slate-700"
                                                            >
                                                                取消
                                                            </button>
                                                            <button
                                                                onClick={() => {
                                                                    gameState.updateLog(log.id, editText);
                                                                    setEditingLogId(null);
                                                                }}
                                                                className="px-4 py-1.5 bg-violet-600 hover:bg-violet-500 rounded text-white font-bold transition-colors shadow-lg shadow-violet-900/20"
                                                            >
                                                                保存
                                                            </button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap">
                                                        {log.message}
                                                    </p>
                                                )}
                                            </div>
                                        ))
                                    }
                                    {gameState.logs.filter(l => l.sourcePlayerId === selectedPlayerId && l.type === 'SPEECH').length === 0 && (
                                        <div className="text-center text-slate-500 py-8 text-sm">
                                            暂无发言记录
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )
            }

            {/* Microphone Permission Request Modal */}
            {
                showPermissionPrompt && micPermission !== 'granted' && (
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
                )
            }
        </div >
    );
}
