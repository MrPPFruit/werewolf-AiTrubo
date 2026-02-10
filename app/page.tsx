'use client';

import { useGameStore } from '@/app/store/gameStore';
import GameSetup from '@/app/components/GameSetup';
import GameInterface from '@/app/components/GameInterface';

export default function Home() {
  const phase = useGameStore((state) => state.phase);
  const isSetup = phase === 'SETUP';

  return (
    <div className="min-h-screen p-4 md:p-8">
      {isSetup ? <GameSetup /> : <GameInterface />}
    </div>
  );
}
