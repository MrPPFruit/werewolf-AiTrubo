'use client';

import { useState, useEffect } from 'react';
import { useGameStore } from '@/app/store/gameStore';
import { Role } from '@/app/types/game';
import { Users, Shield, Zap, Search, Skull, ChevronRight } from 'lucide-react';
import clsx from 'clsx';

const ROLE_LABELS: Record<Role, string> = {
    VILLAGER: '平民',
    WEREWOLF: '狼人',
    SEER: '预言家',
    WITCH: '女巫',
    HUNTER: '猎人',
    GUARD: '守卫',
    IDIOT: '白痴',
    WOLF_KING: '狼王',
    BEAUTY_WOLF: '狼美人',
    MIXBLOOD: '混血儿',
};

const GAME_TEMPLATES = [
    {
        id: '12_standard',
        name: '12人 标准局 (预女猎白)',
        description: '4狼 4民 预女猎白',
        playerCount: 12,
        roles: { WEREWOLF: 4, VILLAGER: 4, SEER: 1, WITCH: 1, HUNTER: 1, IDIOT: 1, GUARD: 0, WOLF_KING: 0, BEAUTY_WOLF: 0, MIXBLOOD: 0 }
    },
    {
        id: '12_guard',
        name: '12人 守卫局 (预女猎守)',
        description: '4狼 4民 预女猎守',
        playerCount: 12,
        roles: { WEREWOLF: 4, VILLAGER: 4, SEER: 1, WITCH: 1, HUNTER: 1, GUARD: 1, IDIOT: 0, WOLF_KING: 0, BEAUTY_WOLF: 0, MIXBLOOD: 0 }
    },
    {
        id: '12_wolf_king_guard',
        name: '12人 狼王守卫 (预女猎守+狼王)',
        description: '3普狼 1狼王 4民 预女猎守',
        playerCount: 12,
        roles: { WEREWOLF: 3, WOLF_KING: 1, VILLAGER: 4, SEER: 1, WITCH: 1, HUNTER: 1, GUARD: 1, IDIOT: 0, BEAUTY_WOLF: 0, MIXBLOOD: 0 }
    },
    {
        id: '12_wolf_king_idiot',
        name: '12人 狼王白痴 (预女猎白+狼王)',
        description: '3普狼 1狼王 4民 预女猎白',
        playerCount: 12,
        roles: { WEREWOLF: 3, WOLF_KING: 1, VILLAGER: 4, SEER: 1, WITCH: 1, HUNTER: 1, IDIOT: 1, GUARD: 0, BEAUTY_WOLF: 0, MIXBLOOD: 0 }
    },
    {
        id: '12_mixblood',
        name: '12人 混子 (预女猎白+混)',
        description: '4狼 3民 1混 预女猎白',
        playerCount: 12,
        roles: { WEREWOLF: 4, VILLAGER: 3, MIXBLOOD: 1, SEER: 1, WITCH: 1, HUNTER: 1, IDIOT: 1, GUARD: 0, WOLF_KING: 0, BEAUTY_WOLF: 0 }
    },
    {
        id: '10_fast',
        name: '10人 速推局',
        playerCount: 10,
        roles: {
            VILLAGER: 4, WEREWOLF: 3, SEER: 1, WITCH: 1, HUNTER: 1,
            IDIOT: 0, GUARD: 0, WOLF_KING: 0, BEAUTY_WOLF: 0
        },
        desc: '节奏较快，适合时间有限时的娱乐'
    },
    {
        id: '9_standard',
        name: '9人从 标准局',
        playerCount: 9,
        roles: {
            VILLAGER: 3, WEREWOLF: 3, SEER: 1, WITCH: 1, HUNTER: 1,
            IDIOT: 0, GUARD: 0, WOLF_KING: 0, BEAUTY_WOLF: 0
        },
        desc: '萌新入门首选，逻辑线相对简单'
    },
];

export default function GameSetup() {
    const setupGame = useGameStore((state) => state.setupGame);

    const [playerCount, setPlayerCount] = useState(12);
    const [roles, setRoles] = useState<Record<Role, number>>({ ...GAME_TEMPLATES[0].roles });
    const [selectedTemplateId, setSelectedTemplateId] = useState<string>('12_standard');

    // Check if current roles match a template
    useEffect(() => {
        // Find if current config matches a template
        const match = GAME_TEMPLATES.find(t =>
            t.playerCount === playerCount &&
            JSON.stringify(t.roles) === JSON.stringify(roles)
        );
        if (match) {
            setSelectedTemplateId(match.id);
        } else {
            setSelectedTemplateId('custom');
        }
    }, [playerCount, roles]);

    const selectTemplate = (templateId: string) => {
        const template = GAME_TEMPLATES.find(t => t.id === templateId);
        if (template) {
            setPlayerCount(template.playerCount);
            setRoles({ ...template.roles });
            setSelectedTemplateId(templateId);
        }
    };

    const [myNumber, setMyNumber] = useState(1);
    const [myRole, setMyRole] = useState<Role>('VILLAGER');


    const updateRoleCount = (role: Role, delta: number) => {
        setRoles(prev => ({
            ...prev,
            [role]: Math.max(0, prev[role] + delta)
        }));
    };

    const currentRoleCount = Object.values(roles).reduce((a, b) => a + b, 0);
    const isValid = currentRoleCount === playerCount;

    const handleStart = () => {
        if (!isValid) return;
        setupGame(playerCount, roles, myRole, myNumber, selectedTemplateId === 'custom' ? undefined : selectedTemplateId);
    };

    return (
        <div className="max-w-6xl mx-auto p-6 space-y-8">
            <div className="text-center space-y-2">
                <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-violet-400 to-cyan-400">
                    创建对局
                </h1>
                <p className="text-slate-400">选择经典版型或自定义配置</p>
            </div>

            <div className="grid md:grid-cols-12 gap-8">
                {/* Left: Template Selection */}
                <div className="md:col-span-4 space-y-4">
                    <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                        <Zap size={20} className="text-amber-400" />
                        推荐流行版型
                    </h3>
                    <div className="space-y-3">
                        {GAME_TEMPLATES.map(t => (
                            <button
                                key={t.id}
                                onClick={() => selectTemplate(t.id)}
                                className={clsx(
                                    "w-full text-left p-4 rounded-xl border transition-all relative overflow-hidden",
                                    selectedTemplateId === t.id
                                        ? "bg-violet-900/40 border-violet-500 shadow-lg shadow-violet-500/10"
                                        : "bg-slate-900/40 border-slate-800 hover:border-slate-700 hover:bg-slate-800/40"
                                )}
                            >
                                <div className="flex justify-between items-center mb-1">
                                    <span className={clsx("font-bold", selectedTemplateId === t.id ? "text-violet-300" : "text-slate-200")}>
                                        {t.name}
                                    </span>
                                    {selectedTemplateId === t.id && <div className="bg-violet-500 w-2 h-2 rounded-full shadow-[0_0_10px_rgba(139,92,246,0.8)]" />}
                                </div>
                                <p className="text-xs text-slate-500">{t.desc}</p>
                            </button>
                        ))}
                        <button
                            disabled={true} // Just a visual indicator for custom
                            className={clsx(
                                "w-full text-left p-4 rounded-xl border transition-all border-dashed",
                                selectedTemplateId === 'custom'
                                    ? "bg-slate-800/40 border-slate-500 text-slate-300"
                                    : "bg-transparent border-slate-800 text-slate-600 opacity-50"
                            )}
                        >
                            <span className="font-bold text-sm">自定义配置...</span>
                            <p className="text-xs mt-1">在右侧手动调整人数和身份</p>
                        </button>
                    </div>
                </div>

                {/* Right: Detailed Configuration (Merged Middle & Right) */}
                <div className="md:col-span-8 turbo-card p-6 flex flex-col gap-8">

                    {/* Top Section: Player Count & My Info */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pb-8 border-b border-slate-800">
                        {/* Player Count */}
                        <div className="space-y-4">
                            <label className="block text-sm font-medium text-slate-300">玩家人数</label>
                            <div className="flex gap-2">
                                {[9, 10, 11, 12].map(count => (
                                    <button
                                        key={count}
                                        onClick={() => setPlayerCount(count)}
                                        className={clsx(
                                            "flex-1 py-3 rounded-lg font-bold text-lg transition-all border",
                                            playerCount === count
                                                ? "bg-cyan-600 border-cyan-500 text-white shadow-[0_0_10px_rgba(8,145,178,0.4)]"
                                                : "bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700 hover:border-slate-500"
                                        )}
                                    >
                                        {count}
                                        <span className="text-xs ml-1 font-normal opacity-60">人</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* My Info */}
                        <div className="space-y-4">
                            <label className="block text-sm font-medium text-slate-300 flex items-center gap-2">
                                <Users size={16} className="text-violet-400" />
                                我的信息
                            </label>
                            <div className="flex gap-4">
                                <div className="flex-1 space-y-2">
                                    <span className="text-xs text-slate-500">我的号码</span>
                                    <select
                                        value={myNumber}
                                        onChange={(e) => setMyNumber(Number(e.target.value))}
                                        className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white outline-none focus:border-violet-500 transition-colors"
                                    >
                                        {Array.from({ length: playerCount }, (_, i) => i + 1).map(num => (
                                            <option key={num} value={num}>{num} 号</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="flex-1 space-y-2">
                                    <span className="text-xs text-slate-500">我的底牌</span>
                                    <select
                                        value={myRole}
                                        onChange={(e) => setMyRole(e.target.value as Role)}
                                        className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white outline-none focus:border-violet-500 transition-colors"
                                    >
                                        {(Object.entries(ROLE_LABELS)).map(([key, label]) => (
                                            <option key={key} value={key}>{label}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        </div>
                    </div>


                    {/* Middle Section: Role Configuration */}
                    <div className="flex-1 space-y-4">
                        <div className="flex justify-between items-center">
                            <label className="text-sm font-medium text-slate-300">版型配置 (点击 + / - 调整)</label>
                            <span className={clsx(
                                "px-2 py-1 rounded text-xs font-bold",
                                currentRoleCount === playerCount
                                    ? "bg-green-500/20 text-green-400"
                                    : "bg-red-500/20 text-red-400"
                            )}>
                                当前: {currentRoleCount} / {playerCount}
                            </span>
                        </div>

                        {/* Grid for Roles - 2 Columns */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                            {(Object.entries(ROLE_LABELS) as [Role, string][]).map(([role, label]) => (
                                <div key={role} className="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg border border-slate-700/50 hover:border-slate-600 transition-colors">
                                    <div className="flex items-center gap-2">
                                        <div className={clsx(
                                            "w-2 h-8 rounded-full",
                                            role === 'WEREWOLF' || role === 'WOLF_KING' || role === 'BEAUTY_WOLF' ? "bg-red-500" :
                                                role === 'VILLAGER' ? "bg-slate-500" : "bg-cyan-500"
                                        )} />
                                        <div className="flex flex-col">
                                            <span className="font-bold text-slate-200">{label}</span>
                                            <span className="text-[10px] text-slate-500 font-mono">{role}</span>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-3">
                                        <button
                                            onClick={() => updateRoleCount(role, -1)}
                                            className="w-8 h-8 flex items-center justify-center rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors disabled:opacity-30"
                                            disabled={roles[role] <= 0}
                                        >
                                            -
                                        </button>
                                        <span className={clsx("w-6 text-center font-bold text-lg", roles[role] > 0 ? "text-white" : "text-slate-600")}>
                                            {roles[role]}
                                        </span>
                                        <button
                                            onClick={() => updateRoleCount(role, 1)}
                                            className="w-8 h-8 flex items-center justify-center rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
                                        >
                                            +
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Bottom: Start Button */}
                    <button
                        onClick={handleStart}
                        disabled={!isValid}
                        className={clsx(
                            "w-full py-5 rounded-xl font-bold text-xl transition-all shadow-lg",
                            isValid
                                ? "bg-gradient-to-r from-violet-600 to-cyan-600 hover:from-violet-500 hover:to-cyan-500 text-white shadow-cyan-900/20 hover:scale-[1.01]"
                                : "bg-slate-800 text-slate-500 cursor-not-allowed"
                        )}
                    >
                        <div className="flex items-center justify-center gap-2">
                            <span>开始对局</span>
                            {isValid && <ChevronRight size={24} className="animate-pulse" />}
                        </div>
                    </button>
                </div>
            </div>
        </div >
    );
}
