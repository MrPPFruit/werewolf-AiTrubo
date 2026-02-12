import { useState } from 'react';
import { useGameStore } from '@/app/store/gameStore';
import { Player } from '@/app/types/game';
import { Check, X } from 'lucide-react';
import clsx from 'clsx';

export default function VoteRecorder() {
    const { players, submitVote, relations, day } = useGameStore();

    // Get voting history for current day to show who already voted
    const todaysVotes = relations.filter(r => r.type === 'VOTE' && r.day === day);

    // List of eligible voters (Alive)
    // In some rules, exiled players can't vote, but here we assume ALIVE players vote.
    const voters = players.filter(p => p.status === 'ALIVE');

    // List of eligible targets (Alive or PK targets? For now, ALIVE)
    const targets = players.filter(p => p.status === 'ALIVE');

    const hasVoted = (voterId: string) => todaysVotes.some(r => r.sourceId === voterId);

    return (
        <div className="turbo-card p-4 flex flex-col gap-4 h-full">
            <h3 className="text-sm font-bold text-amber-500 border-b border-slate-800 pb-2 flex justify-between items-center">
                <span>放逐投票记录 (第 {day} 天)</span>
                <span className="text-xs text-slate-500">
                    {todaysVotes.length} / {voters.length} 已投票
                </span>
            </h3>

            <div className="flex-1 overflow-y-auto space-y-2 pr-2">
                {voters.map(voter => {
                    const existingVote = todaysVotes.find(r => r.sourceId === voter.id);
                    const target = existingVote?.targetId
                        ? players.find(p => p.id === existingVote.targetId)
                        : null;

                    return (
                        <div key={voter.id} className="flex items-center gap-3 bg-slate-900/50 p-2 rounded-lg border border-slate-800/50">
                            {/* Voter Info */}
                            <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center font-bold text-slate-300 border border-slate-700 shrink-0">
                                {voter.number}
                            </div>

                            <div className="flex-1">
                                {existingVote ? (
                                    <div className="flex items-center gap-2 text-sm">
                                        <span className="text-slate-500">投票给</span>
                                        {target ? (
                                            <span className="text-amber-400 font-bold flex items-center gap-1">
                                                <div className="w-5 h-5 rounded-full bg-amber-900/50 flex items-center justify-center text-xs border border-amber-500/30">
                                                    {target.number}
                                                </div>
                                                {/* Optional: Show avatar or name if available */}
                                            </span>
                                        ) : (
                                            <span className="text-slate-500 italic">弃票</span>
                                        )}
                                        {/* Allow re-voting? Maybe simple "X" to clear if we want to implement clearVote */}
                                    </div>
                                ) : (
                                    <select
                                        className="w-full bg-slate-800 text-slate-300 text-sm rounded px-2 py-1 border border-slate-700 focus:outline-none focus:border-violet-500"
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            submitVote(voter.id, val === 'abstain' ? null : val);
                                        }}
                                        defaultValue=""
                                    >
                                        <option value="" disabled>选择投票对象...</option>
                                        <option value="abstain">弃票 (Abstain)</option>
                                        {targets.filter(t => t.id !== voter.id).map(t => (
                                            <option key={t.id} value={t.id}>
                                                {t.number}号
                                            </option>
                                        ))}
                                    </select>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Summary / Result Preview */}
            <div className="bg-slate-950 p-3 rounded text-xs text-slate-400">
                <div className="font-bold mb-1 text-slate-500">当前票型:</div>
                <div className="space-y-1">
                    {/* We could aggregate votes here: P1(3票): 2, 5, 6 */}
                    {/* Let's compute it */}
                    {(() => {
                        const counts: Record<string, string[]> = {};
                        const abstain: string[] = [];
                        todaysVotes.forEach(v => {
                            const voterNum = players.find(p => p.id === v.sourceId)?.number.toString() || '?';
                            if (v.targetId) {
                                if (!counts[v.targetId]) counts[v.targetId] = [];
                                counts[v.targetId].push(voterNum);
                            } else {
                                abstain.push(voterNum);
                            }
                        });

                        return (
                            <>
                                {Object.entries(counts).map(([targetId, voterNums]) => {
                                    const targetNum = players.find(p => p.id === targetId)?.number;
                                    return (
                                        <div key={targetId} className="flex gap-2">
                                            <span className="text-amber-500 font-bold w-12">{targetNum}号</span>
                                            <span className="text-slate-300">({voterNums.length}票):</span>
                                            <span className="text-slate-400">{voterNums.join(', ')}</span>
                                        </div>
                                    );
                                })}
                                {abstain.length > 0 && (
                                    <div className="flex gap-2 mt-1 border-t border-slate-800 pt-1">
                                        <span className="text-slate-500 w-12">弃票</span>
                                        <span className="text-slate-300">({abstain.length}):</span>
                                        <span className="text-slate-500">{abstain.join(', ')}</span>
                                    </div>
                                )}
                            </>
                        );
                    })()}
                </div>
            </div>
        </div>
    );
}
