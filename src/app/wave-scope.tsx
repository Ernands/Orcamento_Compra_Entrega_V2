import { createContext, type ReactNode, type FormEvent, useCallback, useContext, useEffect, useState } from 'react';
import { Layers3, Plus } from 'lucide-react';
import {
  createImplementationWave, listImplementationWaves, readWaveSelection,
  saveWaveSelection, waveSelectionKey, type ImplementationWave, type WaveSelection,
} from '../data/waves/wave-scope-repository';

interface WaveContextValue {
  selected: WaveSelection;
  waves: ImplementationWave[];
  key: string;
  setSelection: (ids: WaveSelection) => void;
  refresh: () => Promise<void>;
}
const WaveContext = createContext<WaveContextValue | null>(null);

export function WaveScopeProvider({ children }: { children: ReactNode }) {
  const [selected, setSelected] = useState<WaveSelection>(readWaveSelection);
  const [waves, setWaves] = useState<ImplementationWave[]>([]);
  const refresh = useCallback(async () => {
    setWaves(await listImplementationWaves());
  }, []);
  useEffect(() => { void refresh().catch(() => { /* The selector displays a retry action. */ }); }, [refresh]);
  const setSelection = (ids: WaveSelection) => {
    const unique = ids === null ? null : [...new Set(ids)].sort((a, b) => a - b);
    saveWaveSelection(unique);
    setSelected(unique);
  };
  return <WaveContext.Provider value={{
    selected, waves, key: waveSelectionKey(selected), setSelection, refresh,
  }}>{children}</WaveContext.Provider>;
}

export function useWaveScope(): WaveContextValue {
  const ctx = useContext(WaveContext);
  if (!ctx) throw new Error('WaveScopeProvider ausente');
  return ctx;
}

export function WaveSelector({ canManage }: { canManage: boolean }) {
  const { selected, waves, setSelection, refresh } = useWaveScope();
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const selectedLabel = selected === null ? 'Todas as ondas'
    : waves.filter((wave) => selected.includes(wave.id)).map((wave) => wave.name).join(' + ')
      || selected.map((id) => `${id}ª onda`).join(' + ');
  const toggle = (id: number) => {
    if (selected === null) return setSelection([id]);
    const next = selected.includes(id) ? selected.filter((value) => value !== id) : [...selected, id];
    setSelection(next.length > 0 ? next : null);
  };
  const create = async (event: FormEvent) => {
    event.preventDefault();
    if (!newName.trim()) return;
    setBusy(true);
    setError('');
    try {
      const wave = await createImplementationWave(newName);
      await refresh();
      setNewName('');
      setSelection([wave.id]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível criar a onda');
    } finally {
      setBusy(false);
    }
  };
  return <div className="wave-selector" data-testid="wave-selector">
    <Layers3 size={17} aria-hidden="true"/>
    <span className="wave-selector__caption">Ondas</span>
    <details className="wave-selector__menu">
      <summary aria-label={'Ondas de implantação: ' + selectedLabel}>{selectedLabel}</summary>
      <div className="wave-selector__options">
        <label><input type="checkbox" checked={selected === null}
          onChange={() => setSelection(null)}/> Todas as ondas</label>
        {waves.map((wave) => <label key={wave.id}>
          <input type="checkbox" checked={selected !== null && selected.includes(wave.id)}
            onChange={() => toggle(wave.id)}/> {wave.name}
        </label>)}
        {!waves.length && <button type="button" className="button button--secondary"
          onClick={() => void refresh().catch((cause) => setError(String(cause)))}>
            Recarregar ondas
          </button>}
        {canManage && <form onSubmit={(event) => void create(event)}>
          <label htmlFor="wave-new-name">Criar onda</label>
          <div className="wave-selector__new">
            <input id="wave-new-name" value={newName} maxLength={100}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="Ex.: 2ª onda" required/>
            <button type="submit" disabled={busy} aria-label="Criar onda"><Plus size={16}/></button>
          </div>
        </form>}
        {error && <small role="alert">{error}</small>}
      </div>
    </details>
  </div>;
}
