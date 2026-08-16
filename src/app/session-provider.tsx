import type { Session } from '@supabase/supabase-js';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { loadViewer, loginWithCpf, logout } from '../data/auth/auth-repository';
import { supabase } from '../data/supabase/client';
import type { Capability, Viewer } from '../domain/types';

interface SessionContextValue {
  session: Session | null;
  viewer: Viewer | null;
  loading: boolean;
  error: string | null;
  login: (cpf: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshViewer: () => Promise<void>;
  can: (capability: Capability) => boolean;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const hydrate = useCallback(async (nextSession: Session | null) => {
    setSession(nextSession);
    setError(null);

    if (!nextSession) {
      setViewer(null);
      setLoading(false);
      return;
    }

    try {
      setViewer(await loadViewer());
    } catch {
      setViewer(null);
      setError('Nao foi possivel carregar suas permissoes. Entre novamente.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;

    void supabase.auth.getSession().then(({ data }) => {
      if (active) void hydrate(data.session);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      window.setTimeout(() => {
        if (active) void hydrate(nextSession);
      }, 0);
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [hydrate]);

  const login = useCallback(
    async (cpf: string, password: string) => {
      setLoading(true);
      setError(null);
      try {
        const nextSession = await loginWithCpf(cpf, password);
        await hydrate(nextSession);
      } catch (loginError) {
        setLoading(false);
        throw loginError;
      }
    },
    [hydrate],
  );

  const signOut = useCallback(async () => {
    await logout();
    await hydrate(null);
  }, [hydrate]);

  const refreshViewer = useCallback(async () => {
    if (!session) return;
    setViewer(await loadViewer());
  }, [session]);

  const value = useMemo<SessionContextValue>(
    () => ({
      session,
      viewer,
      loading,
      error,
      login,
      signOut,
      refreshViewer,
      can: (capability) => viewer?.capabilities.includes(capability) || false,
    }),
    [session, viewer, loading, error, login, signOut, refreshViewer],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error('useSession deve ser usado dentro de SessionProvider.');
  }
  return context;
}
