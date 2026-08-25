import { describe, expect, it } from 'vitest';
import {
  allocateQuantityByWeights,
  buildDestinationValues,
  getProfileDestinationOptions,
  getStoreDestinationOptions,
  inferShippingType,
} from '../domain/supply-freight';
import { quantityToThousandths } from '../domain/supply-calculations';
import type { Store, SupplyFreightProfile } from '../domain/types';

function store(id: string, code: string, name: string, state: string): Store {
  return {
    id,
    code,
    name,
    city: `Cidade ${code}`,
    state,
    address: null,
    responsibleUserId: null,
    responsibleName: null,
    status: 'planning',
    plannedOpeningDate: null,
    notes: null,
  };
}

const stores = [
  store('pe-1', 'LOJ-001', 'Recife 1', 'PE'),
  store('pe-2', 'LOJ-002', 'Recife 2', 'PE'),
  store('pb-1', 'LOJ-007', 'Joao Pessoa', 'PB'),
  store('mg-1', 'LOJ-013', 'Belo Horizonte', 'MG'),
  store('other-1', 'LOJ-028', 'Loja teste', 'SP'),
];

const profiles: SupplyFreightProfile[] = [
  {
    id: 'profile-pe',
    name: 'Valter Leandro',
    state: 'PE',
    active: true,
    position: 10,
    storeIds: ['pe-1', 'pe-2'],
  },
  {
    id: 'profile-pb',
    name: 'Joseney Feitosa',
    state: 'PB',
    active: true,
    position: 20,
    storeIds: ['pb-1'],
  },
  {
    id: 'profile-mg',
    name: 'Charles Pitter',
    state: 'MG',
    active: true,
    position: 40,
    storeIds: ['mg-1'],
  },
];

describe('supply freight destinations', () => {
  it('rateia a quantidade exatamente pelos pesos dos cinco prospectores', () => {
    expect(allocateQuantityByWeights('27', [6, 1, 5, 10, 5])).toEqual([
      '6',
      '1',
      '5',
      '10',
      '5',
    ]);
  });

  it('preserva o total mesmo quando o rateio precisa de milesimos', () => {
    const allocation = allocateQuantityByWeights('1', [1, 1, 1]);
    expect(allocation).toEqual(['0.334', '0.333', '0.333']);
    expect(
      allocation.reduce((sum, value) => sum + quantityToThousandths(value), 0n),
    ).toBe(quantityToThousandths('1'));
  });

  it('monta perfis somente para as lojas do escopo e informa lojas sem perfil', () => {
    const result = getProfileDestinationOptions(
      ['pe-1', 'pe-2', 'pb-1', 'other-1'],
      profiles,
    );

    expect(result.options).toMatchObject([
      {
        profileId: 'profile-pe',
        label: 'Valter Leandro - PE',
        destinationCount: 2,
        weight: 2,
      },
      {
        profileId: 'profile-pb',
        label: 'Joseney Feitosa - PB',
        destinationCount: 1,
        weight: 1,
      },
    ]);
    expect(result.uncoveredStoreIds).toEqual(['other-1']);
  });

  it('restringe o perfil quando o item pertence a uma unica loja', () => {
    const result = getProfileDestinationOptions(
      ['pe-1', 'pe-2', 'mg-1'],
      profiles,
      'mg-1',
    );

    expect(result.uncoveredStoreIds).toEqual([]);
    expect(result.options).toHaveLength(1);
    expect(result.options[0]).toMatchObject({
      profileId: 'profile-mg',
      label: 'Charles Pitter - MG',
      destinationCount: 1,
      weight: 1,
    });
  });

  it('lista destinos por loja com codigo e nome', () => {
    expect(getStoreDestinationOptions(['pe-1', 'pb-1'], stores)).toMatchObject([
      {
        storeId: 'pe-1',
        label: 'LOJ-001 - Recife 1',
        destinationCount: 1,
      },
      {
        storeId: 'pb-1',
        label: 'LOJ-007 - Joao Pessoa',
        destinationCount: 1,
      },
    ]);
  });

  it('interpreta vazio, zero e valor informado de frete', () => {
    expect(inferShippingType('')).toBe('pending');
    expect(inferShippingType('0')).toBe('free');
    expect(inferShippingType('25,90')).toBe('informed');
    expect(() => inferShippingType('-1')).toThrow('Valor de frete invalido');
  });

  it('gera os destinos com quantidade total preservada e frete pendente inicialmente', () => {
    const { options } = getProfileDestinationOptions(
      ['pe-1', 'pe-2', 'pb-1'],
      profiles,
    );
    const destinations = buildDestinationValues('27', 'un', options);

    expect(destinations.map((destination) => destination.quantity)).toEqual(['18', '9']);
    expect(destinations.every((destination) => destination.shippingType === 'pending')).toBe(true);
    expect(
      destinations.reduce(
        (sum, destination) => sum + quantityToThousandths(destination.quantity),
        0n,
      ),
    ).toBe(quantityToThousandths('27'));
  });
});
