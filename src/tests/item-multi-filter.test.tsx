import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  ItemMultiFilter,
  matchesSelectedItems,
  type ItemFilterOption,
} from '../components/item-multi-filter';

const options: ItemFilterOption[] = [
  { id: 'item-a', code: 'ITM-0001', name: 'Cadeira operacional' },
  { id: 'item-b', code: 'ITM-0002', name: 'Mesa de atendimento' },
];

describe('ItemMultiFilter', () => {
  it('permite selecionar mais de um item e limpar a selecao', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = render(
      <ItemMultiFilter label="Filtrar itens" options={options} selectedIds={[]} onChange={onChange} />,
    );

    await user.click(screen.getByText('Todos os itens'));
    await user.click(screen.getByRole('checkbox', { name: /ITM-0001/ }));
    expect(onChange).toHaveBeenLastCalledWith(['item-a']);

    rerender(
      <ItemMultiFilter
        label="Filtrar itens"
        options={options}
        selectedIds={['item-a']}
        onChange={onChange}
      />,
    );
    await user.click(screen.getByRole('checkbox', { name: /ITM-0002/ }));
    expect(onChange).toHaveBeenLastCalledWith(['item-a', 'item-b']);

    rerender(
      <ItemMultiFilter
        label="Filtrar itens"
        options={options}
        selectedIds={['item-a', 'item-b']}
        onChange={onChange}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Limpar' }));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it('usa logica OU quando varios itens estao selecionados', () => {
    expect(matchesSelectedItems(['item-a'], ['item-a', 'item-b'])).toBe(true);
    expect(matchesSelectedItems(['item-b'], ['item-a', 'item-b'])).toBe(true);
    expect(matchesSelectedItems(['item-c'], ['item-a', 'item-b'])).toBe(false);
    expect(matchesSelectedItems(['item-c'], [])).toBe(true);
  });
});
