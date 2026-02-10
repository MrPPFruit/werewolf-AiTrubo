'use client';

import { Player, Role } from '@/app/types/game';
import { Mic, Skull, Shield, Crosshair, Target, Crown } from 'lucide-react';
import clsx from 'clsx';

interface PlayerCardProps {
    player: Player;
    isMe: boolean;
    onClick: () => void;
    latestSpeech?: string;
    onQuickRecord?: (e: React.MouseEvent) => void;
    isRecording?: boolean;
    relations?: { id: string, type: string, sourceId: string, targetId?: string, sourceNumber?: number }[];
}

export default function PlayerCard({ player, isMe, onClick, latestSpeech, onQuickRecord, isRecording, relations }: PlayerCardProps) {
    const isDead = player.status === 'DEAD' || player.status === 'EXILED';

    // Sort probabilities > 10%
    const probs = player.roleProbabilities ? Object.entries(player.roleProbabilities)
        .filter(([, prob]) => prob > 10)
        .sort(([, a], [, b]) => b - a) : [];

    return (
        <div
            onClick={onClick}
            className={clsx(
                "relative aspect-[3/4] rounded-xl border-2 transition-all cursor-pointer overflow-visible group hover:scale-105",
                isMe
                    ? "border-violet-500 shadow-[0_0_15px_rgba(139,92,246,0.3)] bg-slate-900"
                    : "border-slate-700 bg-slate-900/50 hover:border-slate-500",
                isDead && "opacity-60 grayscale border-slate-800"
            )}
        >
            {/* Header: Number & Badge */}
            <div className="absolute top-2 left-2 right-2 flex justify-between items-start z-10">
                <span className={clsx(
                    "w-8 h-8 flex items-center justify-center rounded-full font-mono font-bold text-lg shadow-md",
                    isMe ? "bg-violet-600 text-white" : "bg-slate-700 text-slate-300"
                )}>
                    {player.number}
                </span>

                <div className="flex gap-1">
                    {player.isSheriff && (
                        <div className="bg-amber-500 text-white p-1 rounded-full shadow-lg shadow-amber-500/50 animate-pulse">
                            <Crown size={16} fill="currentColor" />
                        </div>
                    )}

                    {player.isMarkedTeammate && !isDead && (
                        <div className="bg-red-900 border border-red-500 text-red-500 p-1 rounded-full shadow-lg shadow-red-500/20">
                            <Skull size={16} fill="currentColor" />
                        </div>
                    )}

                    {/* Gun Status Tags - Shooter */}
                    {(player.tags?.includes('SHOOTER') || relations?.some(r => r.type === 'SHOOT' && r.sourceId === player.id)) && (
                        <div className="absolute top-0 left-0 bg-amber-600 rounded-full p-1 shadow-lg transform -translate-x-1/2 -translate-y-1/2 z-10" title="开枪者">
                            <Crosshair size={14} className="text-white" />
                        </div>
                    )}
                    {player.tags?.includes('SHOT_DEAD') && (
                        <div className="absolute top-0 right-0 bg-red-600 rounded-full p-1 shadow-lg transform translate-x-1/2 -translate-y-1/2 z-10">
                            <Target size={14} className="text-white" />
                        </div>
                    )}

                    {player.markedRole ? (
                        <div
                            className={clsx(
                                "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold border-2 border-slate-900",
                                player.markedRole === 'GOOD' && "bg-green-500 text-white",
                                player.markedRole === 'BAD' && "bg-red-500 text-white",
                                player.markedRole === 'SILVER' && "bg-slate-200 text-slate-900",
                                player.markedRole === 'PROTECT' && "bg-emerald-500 text-white",
                            )}
                        >
                            {player.markedRole === 'GOOD' ? '金' :
                                player.markedRole === 'BAD' ? '查' :
                                    player.markedRole === 'SILVER' ? '银' :
                                        player.markedRole === 'PROTECT' ? <Shield size={12} fill="currentColor" /> : '?'}
                        </div>
                    ) : null}
                </div>
            </div>

            {/* Probability Overlay (Top Right) */}
            {probs.length > 0 && !isDead && (
                <div className="absolute top-10 right-2 flex flex-col items-end gap-0.5 z-10 pointer-events-none">
                    {probs.map(([role, prob]) => (
                        <div key={role} className={clsx(
                            "text-[9px] px-1 rounded shadow-sm opacity-90 backdrop-blur-sm border",
                            role === 'WEREWOLF' ? "bg-red-950/80 text-red-400 border-red-900" :
                                role === 'VILLAGER' ? "bg-slate-800/80 text-slate-400 border-slate-700" :
                                    role === 'SEER' ? "bg-cyan-950/80 text-cyan-400 border-cyan-900" :
                                        role === 'WITCH' ? "bg-purple-950/80 text-purple-400 border-purple-900" :
                                            "bg-slate-900/80 text-gray-400 border-slate-700"
                        )}>
                            {role === 'WEREWOLF' ? '狼' :
                                role === 'VILLAGER' ? '民' :
                                    role === 'SEER' ? '预' :
                                        role === 'WITCH' ? '女' : role} {prob}%
                        </div>
                    ))}
                </div>
            )}

            {/* Center: Role Icon / Status */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pt-6 pointer-events-none">
                {isDead ? (
                    <Skull size={48} className="text-slate-600" />
                ) : (
                    <div className="w-16 h-16 rounded-full bg-slate-800/50 flex items-center justify-center relative">
                        {/* Placeholder for Avatar */}
                        <span className="text-2xl opacity-20">?</span>

                        {/* Show if Shot - Victim */}
                        {relations?.filter(r => r.type === 'SHOOT' && r.targetId === player.id).map(r => (
                            <div key={r.id} className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
                                <div className="absolute inset-0 border-4 border-red-600 rounded-full animate-pulse opacity-60" />
                                <div className="bg-red-900/90 text-white text-[10px] font-bold px-2 py-0.5 rounded-full border border-red-500 shadow-xl transform translate-y-8 flex items-center gap-1 min-w-max">
                                    <Target size={12} />
                                    <span>被 {r.sourceNumber ? r.sourceNumber : '?'} 号带走</span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Quick Record Button (Bottom Right) */}
            {onQuickRecord && !isDead && (
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onQuickRecord(e);
                    }}
                    className={clsx(
                        "absolute bottom-2 right-2 p-2 rounded-full shadow-lg transition-all z-20 group-hover:scale-110",
                        isRecording
                            ? "bg-red-500 text-white animate-pulse ring-4 ring-red-500/20"
                            : "bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white"
                    )}
                    title={isRecording ? "停止录音" : "开始录音"}
                >
                    <Mic size={16} fill={isRecording ? "currentColor" : "none"} />
                </button>
            )}



            {/* Footer: Role Name / Action */}
            <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/90 to-transparent p-3 pt-8">
                <div className="flex justify-between items-end">
                    <div className="flex flex-col">
                        {isMe && player.role && (
                            <span className="text-violet-300 font-bold text-sm tracking-wider">
                                {player.role}
                            </span>
                        )}
                        <span className={clsx("text-xs font-medium uppercase", isDead ? "text-red-500" : "text-green-500")}>
                            {player.status === 'EXILED' ? '放逐' : (player.status === 'DEAD' ? '死亡' : '存活')}
                        </span>
                    </div>

                    {/* Action Button Placeholder (e.g. Record) */}
                    {!isDead && (
                        <button className="p-1.5 rounded-full bg-slate-800 text-slate-400 hover:bg-cyan-500 hover:text-white transition-colors">
                            <Mic size={14} />
                        </button>
                    )}
                </div>
            </div>

            {/* Speech Overlay (Centered) */}
            {latestSpeech && !isDead && (
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90%] z-20 animate-in fade-in zoom-in-95 duration-300 pointer-events-none">
                    <div className="bg-black/70 backdrop-blur-md text-slate-100 text-xs py-2 px-3 rounded-xl border border-white/10 shadow-2xl text-center leading-relaxed">
                        &ldquo;{latestSpeech}&rdquo;
                    </div>
                </div>
            )}

            {/* Hitbox overlay for status effect */}
            {isDead && (
                <div className="absolute inset-0 bg-red-900/10 pointer-events-none" />
            )}
        </div>
    );
}
