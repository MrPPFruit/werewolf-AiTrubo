'use client';

import { Player, Role } from '@/app/types/game';
import { Mic, Skull, Shield, Crosshair, Target, Crown } from 'lucide-react';
import clsx from 'clsx';

interface PlayerCardProps {
    player: Player;
    isMe: boolean;
    onClick: () => void;
    onQuickRecord?: (e: React.MouseEvent) => void;
    onToggleCampaign?: (e: React.MouseEvent) => void;
    onQuitElection?: (e: React.MouseEvent) => void;
    isRecording?: boolean;
    relations?: { id: string, type: string, sourceId: string, targetId?: string, sourceNumber?: number }[];
    isMixbloodTarget?: boolean;
}

export default function PlayerCard({ player, isMe, onClick, onQuickRecord, onToggleCampaign, onQuitElection, isRecording, relations, isMixbloodTarget }: PlayerCardProps) {
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
            {probs.length > 0 && (
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

            {/* Center: Role Icon / Status / Election Status */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pt-6 pointer-events-none">
                {isDead ? (
                    <Skull size={48} className="text-slate-600" />
                ) : (
                    <div className="w-16 h-16 rounded-full bg-slate-800/50 flex items-center justify-center relative">
                        {/* Placeholder for Avatar */}
                        <span className="text-2xl opacity-20">?</span>

                        {/* Election Status: Campaigning (Hand) */}
                        {player.isCampaigning && !player.hasQuitElection && (
                            <div className="absolute -top-2 -right-2 bg-amber-500 rounded-full p-1 shadow-lg animate-bounce z-20">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M12 2C13.1 2 14 2.9 14 4V11C14 11.55 13.55 12 13 12C12.45 12 12 11.55 12 11V7" stroke="white" strokeWidth="2" strokeLinecap="round" />
                                    <path d="M9 13V7C9 6.45 8.55 6 8 6C7.45 6 7 6.45 7 7V13" stroke="white" strokeWidth="2" strokeLinecap="round" />
                                    <path d="M17 13V8C17 7.45 16.55 7 16 7C15.45 7 15 7.45 15 8V13" stroke="white" strokeWidth="2" strokeLinecap="round" />
                                    <path d="M20 13V9C20 8.45 19.55 8 19 8C18.45 8 18 8.45 18 9V13" stroke="white" strokeWidth="2" strokeLinecap="round" />
                                    <path d="M7 13C7 16 10.5 19 13.5 19C15.5 19 17.5 18 19 16.5" stroke="white" strokeWidth="2" strokeLinecap="round" />
                                    <path d="M7 13V15" stroke="white" strokeWidth="2" strokeLinecap="round" />
                                </svg>
                            </div>
                        )}

                        {/* Election Status: Quit (Water Drop) */}
                        {player.hasQuitElection && (
                            <div className="absolute -bottom-2 -right-2 bg-blue-500 rounded-full p-1 shadow-lg z-20">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M12 22C16.4183 22 20 18.4183 20 14C20 10 12 2 12 2C12 2 4 10 4 14C4 18.4183 7.58172 22 12 22Z" fill="white" />
                                </svg>
                            </div>
                        )}

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
                        {/* Mixblood Link (Visible to self) */}
                        {isMixbloodTarget && (
                            <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
                                <div className="absolute inset-0 border-4 border-purple-500 rounded-full animate-pulse opacity-60" />
                                <div className="bg-purple-900/90 text-white text-[10px] font-bold px-2 py-0.5 rounded-full border border-purple-500 shadow-xl transform -translate-y-8 flex items-center gap-1 min-w-max">
                                    <Crown size={12} />
                                    <span>榜样</span>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>





            {/* Footer: Role Name / Action */}
            <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/90 to-transparent p-2 pt-6">
                <div className="flex justify-between items-end">
                    <div className="flex flex-col min-w-0 pr-1">
                        {isMe && player.role && (
                            <span className="text-violet-300 font-bold text-xs tracking-wider truncate">
                                {player.role}
                            </span>
                        )}
                        <span className={clsx("text-[10px] font-medium uppercase", isDead ? "text-red-500" : "text-green-500")}>
                            {player.status === 'EXILED' ? '放逐' : (player.status === 'DEAD' ? '死亡' : '存活')}
                        </span>
                    </div>

                    {/* Action Button Group */}
                    <div className="flex items-center gap-1 shrink-0">
                        {!isDead && (
                            <>
                                {onToggleCampaign && (
                                    <button
                                        onClick={(e) => { e.stopPropagation(); onToggleCampaign(e); }}
                                        className={clsx(
                                            "w-6 h-6 flex items-center justify-center rounded-full transition-colors",
                                            player.isCampaigning ? "bg-amber-600 text-white" : "bg-slate-800 text-slate-400 hover:bg-amber-500 hover:text-white"
                                        )}
                                        title={player.isCampaigning ? "取消上警" : "上警"}
                                    >
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2L2 7L12 12M12 2L22 7L12 12M12 12V22M2 7L12 22L22 7" /></svg>
                                    </button>
                                )}
                                {onQuitElection && player.isCampaigning && !player.hasQuitElection && (
                                    <button
                                        onClick={(e) => { e.stopPropagation(); onQuitElection(e); }}
                                        className="w-6 h-6 flex items-center justify-center rounded-full bg-slate-800 text-slate-400 hover:bg-blue-500 hover:text-white transition-colors"
                                        title="退水"
                                    >
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 22C16.4183 22 20 18.4183 20 14C20 10 12 2 12 2C12 2 4 10 4 14C4 18.4183 7.58172 22 12 22Z" /></svg>
                                    </button>
                                )}
                            </>
                        )}

                        {/* Recording is allowed for dead players (e.g. Last Words) */}
                        {onQuickRecord && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onQuickRecord(e);
                                }}
                                className={clsx(
                                    "w-8 h-8 flex items-center justify-center rounded-full transition-all shadow-lg",
                                    isRecording
                                        ? "bg-red-500 text-white animate-pulse"
                                        : "bg-slate-700 text-slate-300 hover:bg-slate-600 hover:text-white border border-slate-600"
                                )}
                                title={isRecording ? "停止录音" : "开始录音"}
                            >
                                <Mic size={14} fill={isRecording ? "currentColor" : "none"} />
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Speech Overlay REMOVED */}
            {/* latestSpeech prop is no longer used for display */}

            {/* Hitbox overlay for status effect */}
            {
                isDead && (
                    <div className="absolute inset-0 bg-red-900/10 pointer-events-none" />
                )
            }
        </div >
    );
}
