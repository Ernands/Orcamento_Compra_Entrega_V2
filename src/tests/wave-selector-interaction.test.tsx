import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WaveScopeProvider, WaveSelector, useWaveScope } from '../app/wave-scope';
import { saveWaveSelection } from '../data/waves/wave-scope-repository';

vi.mock('../data/supabase/client', () => ({
  supabase: {
    from(table: string) {
      if (table !== 'implementation_waves') throw new Error('Unexpected query: ' + table);
      return {
        select() { return this; },
        order() {
          return Promise.resolve({ data: [
            { id: 1, name: '1ª onda', status: 'in_progress' },
            { id: 2, name: '2ª onda', status: 'planning' },
          ], error: null });
        },
      };
    },
  },
}));

function CurrentScope() {
  const { key } = useWaveScope();
  return <output data-testid="current-wave">{key}</output>;
}
function SelectorHarness() {
  return <WaveScopeProvider><WaveSelector canManage={false}/><CurrentScope/></WaveScopeProvider>;
}

beforeEach(() => {
  window.localStorage.clear();
  saveWaveSelection([1]);
});

describe('Filtro global de ondas', () => {
  it('combina ondas, preserva a escolha ao remontar e volta ao consolidado explicitamente', async () => {
    const user = userEvent.setup();
    const mounted = render(<SelectorHarness/>);
    expect(screen.getByTestId('current-wave')).toHaveTextContent('1');
    await user.click(screen.getByLabelText('Ondas de implantação: 1ª onda'));
    await user.click(await screen.findByRole('checkbox', { name: '2ª onda' }));
    expect(screen.getByTestId('current-wave')).toHaveTextContent('1,2');
    await user.click(screen.getByRole('checkbox', { name: '1ª onda' }));
    expect(screen.getByTestId('current-wave')).toHaveTextContent('2');
    mounted.unmount();

    render(<SelectorHarness/>);
    expect(screen.getByTestId('current-wave')).toHaveTextContent('2');
    await user.click(screen.getByLabelText('Ondas de implantação: 2ª onda'));
    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Todas as ondas' })).toBeInTheDocument());
    await user.click(screen.getByRole('checkbox', { name: 'Todas as ondas' }));
    expect(screen.getByTestId('current-wave')).toHaveTextContent('all');
  });
});
