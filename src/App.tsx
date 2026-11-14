import { useState } from 'react';
import { randomSeed } from './game/rng';
import { loadLoadouts, saveLoadouts } from './game/storage';
import type { Loadout, MatchConfig, MatchRecord } from './game/types';
import { LoadoutBuilder } from './ui/LoadoutBuilder';
import { MatchScreen, type MatchMode } from './ui/MatchScreen';
import { SetupScreen } from './ui/SetupScreen';
import { LiveViewer, ReplayViewer, SpectateLobby } from './ui/SpectateScreen';

type Screen =
  | { name: 'menu' }
  | { name: 'loadouts' }
  | { name: 'setup' }
  | { name: 'match'; config: MatchConfig; mode: MatchMode; key: number }
  | { name: 'spectate' }
  | { name: 'live'; matchId: string }
  | { name: 'replay'; record: MatchRecord };

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'menu' });
  const [loadouts, setLoadouts] = useState<Loadout[]>(loadLoadouts);

  const updateLoadouts = (l: Loadout[]) => {
    setLoadouts(l);
    saveLoadouts(l);
  };
  const menu = () => setScreen({ name: 'menu' });

  switch (screen.name) {
    case 'loadouts':
      return <LoadoutBuilder loadouts={loadouts} onChange={updateLoadouts} onBack={menu} />;
    case 'setup':
      return (
        <SetupScreen
          loadouts={loadouts}
          onBack={menu}
          onStart={(config, mode) => setScreen({ name: 'match', config, mode, key: Date.now() })}
        />
      );
    case 'match':
      return (
        <MatchScreen
          key={screen.key}
          config={screen.config}
          mode={screen.mode}
          onExit={menu}
          onRematch={() => setScreen({ ...screen, config: { ...screen.config, seed: randomSeed() }, key: Date.now() })}
          onWatchReplay={(record) => setScreen({ name: 'replay', record: structuredClone(record) })}
        />
      );
    case 'spectate':
      return (
        <SpectateLobby
          onBack={menu}
          onWatchLive={(matchId) => setScreen({ name: 'live', matchId })}
          onWatchReplay={(record) => setScreen({ name: 'replay', record })}
        />
      );
    case 'live':
      return <LiveViewer matchId={screen.matchId} onBack={() => setScreen({ name: 'spectate' })} />;
    case 'replay':
      return <ReplayViewer record={screen.record} onBack={() => setScreen({ name: 'spectate' })} />;
    case 'menu':
      return (
        <div className="menu">
          <div className="menu-hex" aria-hidden />
          <h1 className="title">MAGICA</h1>
          <p className="tagline">Hex-tile duels of steel and sorcery</p>
          <nav>
            <button className="primary big" onClick={() => setScreen({ name: 'setup' })}>
              Play
            </button>
            <button className="big" onClick={() => setScreen({ name: 'loadouts' })}>
              Loadouts
            </button>
            <button className="big" onClick={() => setScreen({ name: 'spectate' })}>
              Spectate &amp; replays
            </button>
          </nav>
          <p className="muted hint">Move: click a lit hex · Abilities: 1–4 · End turn: Space</p>
        </div>
      );
  }
}
