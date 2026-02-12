// @ts-nocheck
import { useState } from 'react';
import { useGameStore } from '@/app/store/gameStore';
import { Player } from '@/app/types/game';
import { Check, X, ArrowLeft } from 'lucide-react';
import clsx from 'clsx';

interface VoteRecorderProps {
    mode?: 'EXILE' | 'SHERIFF';
    onClose?: () => void;
}

export default function VoteRecorder({ mode = 'EXILE', onClose }: VoteRecorderProps) {
    const { players, submitVote, retractVote, organizeVote, relations, day, phase, sheriffId, myPlayerId } = useGameStore();

    // Get voting history for current day to show who already voted
    // Note: If multiple votes happen in one day (Sheriff + Exile), this simple filter mixes them.
    // Ideally we filter by phase too if relation recorded it, but currently it doesn't.
    // For now we assume they don't overlap or we accept the mix.
    // Get voting history for current day AND phase to isolate Sheriff Vote from Exile Vote
    const todaysVotes = relations.filter(r => r.type === 'VOTE' && r.day === day && (r.phase === (mode === 'SHERIFF' ? 'ELECTION' : 'VOTE')));

    // List of eligible voters (Alive)
    let voters = players.filter(p => p.status === 'ALIVE');
    let targets = players.filter(p => p.status === 'ALIVE');
    let title = "放逐投票记录";

    if (mode === 'SHERIFF') {
        title = "警长竞选投票";
        // Candidates: Campaigning and NOT quit
        targets = players.filter(p => p.isCampaigning && !p.hasQuitElection);
        // Voters: Alive and NOT currently campaigning (those who quit CAN vote usually)
        voters = players.filter(p => p.status === 'ALIVE' && (!p.isCampaigning || p.hasQuitElection));
    }

    // Sheriff Organization State
    const [selectedTargets, setSelectedTargets] = useState<string[]>([]);
    const isSheriff = myPlayerId === sheriffId;
    const isVotePhase = mode === 'EXILE';

    const handleSheriffOrganize = () => {
        if (selectedTargets.length > 0) {
            organizeVote(selectedTargets);
            setSelectedTargets([]); // Clear after organizing
            alert('归票成功！已在日志中记录。');
        }
    };

    return (
        <div className="turbo-card p-4 flex flex-col gap-4 h-full">
            <h3 className="text-sm font-bold text-amber-500 border-b border-slate-800 pb-2 flex justify-between items-center shrink-0">
                <div className="flex items-center gap-2">
                    {onClose && (
                        <button onClick={onClose} className="hover:text-white transition-colors">
                            <ArrowLeft size={16} />
                        </button>
                    )}
                    <span>{title} (第 {day} 天)</span>
                </div>
                <span className="text-xs text-slate-500">
                    {todaysVotes.length} / {voters.length} 已投票
                </span>
            </h3>

            {/* Sheriff Organization UI (Only visible to Sheriff during Exile Vote) */}
            {isSheriff && isVotePhase && (
                <div className="bg-amber-950/30 p-3 rounded-lg border border-amber-600/30 mb-2 shrink-0">
                    <h4 className="text-xs font-bold text-amber-500 mb-2 flex justify-between items-center">
                        <span>警长归票 (多选)</span>
                        <button
                            onClick={handleSheriffOrganize}
                            disabled={selectedTargets.length === 0}
                            className="bg-amber-600 text-white px-2 py-0.5 rounded text-xs hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            确认归票
                        </button>
                    </h4>
                    <div className="flex flex-wrap gap-2">
                        {targets.map(target => (
                            <button
                                key={target.id}
                                onClick={() => {
                                    setSelectedTargets(prev =>
                                        prev.includes(target.id)
                                            ? prev.filter(id => id !== target.id)
                                            : [...prev, target.id]
                                    );
                                }}
                                className={clsx(
                                    "px-2 py-1 rounded text-xs border transition-colors",
                                    selectedTargets.includes(target.id)
                                        ? "bg-amber-600/50 border-amber-500 text-white"
                                        : "bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500"
                                )}
                            >
                                {target.number}号
                            </button>
                        ))}
                    </div>
                </div>
            )}

            <div className="flex-1 overflow-y-auto space-y-2 pr-2 min-h-0">
                {voters.length === 0 ? (
                    <div className="text-center text-slate-500 py-8">
                        没有符合条件的投票者
                    </div>
                ) : voters.map(voter => {
                    const existingVote = todaysVotes.find(r => r.sourceId === voter.id);
                    // Check if vote is valid target (might be old vote from Exile if mixing?)
                    // Just show what is recorded.
                    const target = existingVote?.targetId
                        ? players.find(p => p.id === existingVote.targetId)
                        : null;

                    return (
                        <div key={voter.id} className="flex items-center gap-3 bg-slate-900/50 p-2 rounded-lg border border-slate-800/50">
                            {/* Voter Info */}
                            <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center font-bold text-slate-300 border border-slate-700 shrink-0">
                                {voter.number}
                            </div>

                            <div className="flex-1 min-w-0">
                                {existingVote ? (
                                    <div className="flex items-center gap-2 text-sm">
                                        <span className="text-slate-500">投票给</span>
                                        {target ? (
                                            <span className="text-amber-400 font-bold flex items-center gap-1">
                                                <div className="w-5 h-5 rounded-full bg-amber-900/50 flex items-center justify-center text-xs border border-amber-500/30">
                                                    {target.number}
                                                </div>
                                            </span>
                                        ) : (
                                            <span className="text-slate-500 italic">弃票</span>
                                        )}
                                        {/* Reset button to correct mistakes */}
                                        <button
                                            onClick={() => retractVote(voter.id)}
                                            className="ml-auto text-xs text-slate-600 hover:text-slate-400"
                                        >
                                            修改
                                        </button>
                                    </div>
                                ) : (
                                    <select
                                        className="w-full bg-slate-800 text-slate-300 text-sm rounded px-2 py-1 border border-slate-700 focus:outline-none focus:border-violet-500"
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            if (!val) return;
                                            submitVote(voter.id, val === 'abstain' ? null : val);
                                        }}
                                        defaultValue=""
                                    >
                                        <option value="" disabled>选择对象...</option>
                                        <option value="abstain">弃票</option>
                                        {targets.filter(t => t.id !== voter.id).map(t => (
                                            <option key={t.id} value={t.id}>
                                                {t.number}号 {t.isCampaigning ? '(警上)' : ''}
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
            <div className="bg-slate-950 p-3 rounded-lg text-xs text-slate-400 shrink-0 border border-slate-800">
                <div className="font-bold mb-2 text-slate-500 flex justify-between">
                    <span>当前票型统计</span>
                </div>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                    {(() => {
                        const counts: Record<string, string[]> = {};
                        const abstain: string[] = [];

                        // Only count votes from CURRENT eligible voters to avoid mixing old votes if possible?
                        // But relations stores all. We'll filter only relations that match our voters.
                        const voterIds = new Set(voters.map(v => v.id));
                        const relevantVotes = todaysVotes.filter(v => voterIds.has(v.sourceId));

                        relevantVotes.forEach(v => {
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
                                        <div key={targetId} className="flex gap-2 items-start">
                                            <span className="text-amber-500 font-bold w-8 shrink-0">{targetNum}号</span>
                                            <span className="text-slate-500">({voterNums.length}票):</span>
                                            <span className="text-slate-300 break-words flex-1">{voterNums.join(', ')}</span>
                                        </div>
                                    );
                                })}
                                {abstain.length > 0 && (
                                    <div className="flex gap-2 items-start text-slate-500 pt-1 border-t border-slate-800/50 mt-1">
                                        <span className="w-8 shrink-0">弃票</span>
                                        <span>({abstain.length}):</span>
                                        <span className="break-words flex-1">{abstain.join(', ')}</span>
                                    </div>
                                )}
                                {relevantVotes.length === 0 && <div className="text-slate-600 italic">暂无投票</div>}
                            </>
                        );
                    })()}
                </div>
            </div>
        </div>
    );
}
