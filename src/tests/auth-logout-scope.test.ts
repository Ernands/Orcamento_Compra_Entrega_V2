import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  signOut: vi.fn(),
}));

vi.mock('../lib/edge-function', () => ({
  invokeEdgeFunction: vi.fn(),
}));

vi.mock('../data/supabase/client', () => ({
  supabase: {
    auth: {
      signOut: mocks.signOut,
    },
  },
}));

import { logout } from '../data/auth/auth-repository';

describe('logout scope', () => {
  beforeEach(() => {
    mocks.signOut.mockReset();
  });

  it('encerra somente a sessao atual', async () => {
    mocks.signOut.mockResolvedValue({ error: null });

    await expect(logout()).resolves.toBeUndefined();

    expect(mocks.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });
});
