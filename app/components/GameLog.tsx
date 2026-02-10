'use client';

import { useGameStore } from '@/app/store/gameStore';
import { History, Clock } from 'lucide-react';
import { useRef, useEffect } from 'react';

export default function GameLog() {
    const logs = useGameStore((state) => state.logs);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [logs]);

    if (logs.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center p-8 text-slate-500 gap-2 h-full">
                <History className="opacity-50" size={32} />
                <p className="text-sm">暂无游戏记录</p>
            </div>
        );
    }

    return (
        <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-3 p-2 custom-scrollbar max-h-[300px]">
            {logs.map((log) => (
                <div key={log.id} className="flex gap-3 text-sm group">
                    <div className="min-w-[40px] text-xs text-slate-500 font-mono pt-1 text-right">
                        {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                    <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                            <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                                {log.phase}
                            </span>
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-violet-900/30 text-violet-300 border border-violet-800/30">
                                {log.type}
                            </span>
                        </div>
                        <p className="text-slate-300 leading-relaxed">
                            {log.message}
                        </p>
                    </div>
                </div>
            ))}
        </div>
    );
}
