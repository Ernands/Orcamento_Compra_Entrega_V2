import type { Session } from '@supabase/supabase-js';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
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
const VIEWER_LOAD_ERROR = 'Nao foi possivel validar suas permissoes. Tente novamente.';
const SESSION_LOAD_ERROR = 'Nao foi possivel verificar sua sessao. Tente novamente.';

function isTemporaryFailure(cause: unknown): boolean {
  if (!cause || typeof cause !== 'object') return false;
  const error = cause as { status?: number; code?: string; message?: string };
  if (error.status === 401 || error.status === 403 || error.code === '42501') return false;
  if (
    error.status === 0 || error.status === 408 || error.status === 425 ||
    error.status === 429 || (typeof error.status === 'number' && error.status >= 500)
  ) return true;

  return /failed to fetch|network|timeout|timed out|temporar|connection|offline/i.test(
    error.message || '',
  );
}

async function loadViewerWithRetry(): Promise<Viewer> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await loadViewer();
    } catch (cause) {
      if (!isTemporaryFailure(cause) || attempt === 2) throw cause;
      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, 200 * (attempt + 1));
      });
    }
  }
  throw new Error(VIEWER_LOAD_ERROR);
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const sessionRef = useRef<Session | null>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const requestVersion = useRef(0);
  const pendingViewer = useRef<{ userId: string; task: Promise<void> } | null>(null);

  const hydrate = useCallback(async (nextSession: Session | null, force = false): Promise<void> => {
    const previousUserId = sessionRef.current?.user?.id;
    const nextUserId = nextSession?.user?.id;
    sessionRef.current = nextSession;
    setSession(nextSession);

    if (!nextSession) {
      requestVersion.current += 1;
      pendingViewer.current = null;
      viewerRef.current = null;
      setViewer(null);
      setError(null);
      setLoading(false);
      return;
    }

    if (previousUserId && previousUserId !== nextUserId) {
      // Never expose a prior user's permissions while another identity loads.
      requestVersion.current += 1;
      pendingViewer.current = null;
      viewerRef.current = null;
      setViewer(null);
    }

    if (!nextUserId) {
      setError(VIEWER_LOAD_ERROR);
      setLoading(false);
      return;
    }

    if (!force && viewerRef.current?.authUserId === nextUserId) {
      // TOKEN_REFRESHED and repeated SIGNED_IN are not permission changes.
      setError(null);
      setLoading(false);
      return;
    }

    if (pendingViewer.current?.userId === nextUserId) {
      // INITIAL_SESSION, getSession and SIGNED_IN may arrive together.
      return pendingViewer.current.task;
    }

    const version = ++requestVersion.current;
    setLoading(viewerRef.current === null);
    setError(null);

    const task = (async () => {
      try {
        const nextViewer = await loadViewerWithRetry();
        if (version !== requestVersion.current || sessionRef.current?.user?.id !== nextUserId) return;
        if (nextViewer.authUserId !== nextUserId) throw new Error('Usuario da sessao divergente.');
        viewerRef.current = nextViewer;
        setViewer(nextViewer);
        setError(null);
      } catch (cause) {
        if (version !== requestVersion.current || sessionRef.current?.user?.id !== nextUserId) return;
        if (isTemporaryFailure(cause) && viewerRef.current?.authUserId === nextUserId) {
          // Preserve previously verified access through a temporary connection failure.
          setError(null);
        } else {
          // A real permission/identity failure must not expose protected pages.
          viewerRef.current = null;
          setViewer(null);
          setError(VIEWER_LOAD_ERROR);
        }
      } finally {
        if (version === requestVersion.current) {
          pendingViewer.current = null;
          setLoading(false);
        }
      }
    })();
    pendingViewer.current = { userId: nextUserId, task };
    return task;
  }, []);

  useEffect(() => {
    let active = true;
    let receivedAuthEvent = false;

    void supabase.auth.getSession()
      .then(({ data, error: sessionError }) => {
        // A newer auth event takes precedence over a delayed startup response.
        if (!active || receivedAuthEvent) return;
        if (sessionError) {
          setError(SESSION_LOAD_ERROR);
          setLoading(false);
          return;
        }
        void hydrate(data.session);
      })
      .catch(() => {
        if (!active || receivedAuthEvent) return;
        setError(SESSION_LOAD_ERROR);
        setLoading(false);
      });

    const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
      receivedAuthEvent = true;
      // Do not await other Supabase calls inside an onAuthStateChange callback.
      window.setTimeout(() => {
        if (!active) return;
        if (event === 'SIGNED_OUT') {
          void hydrate(null);
        } else if (nextSession) {
          void hydrate(nextSession);
        } else if (event === 'INITIAL_SESSION') {
          void hydrate(null);
        }
      }, 0);
    });

    return () => {
      active = false;
      requestVersion.current += 1;
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
    if (sessionRef.current) {
      await hydrate(sessionRef.current, true);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      await hydrate(data.session, true);
    } catch {
      setError(SESSION_LOAD_ERROR);
      setLoading(false);
    }
  }, [hydrate]);

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
