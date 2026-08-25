import { quantityToThousandths } from './supply-calculations';
import type {
  Store,
  SupplyFreightProfile,
  SupplyQuoteItemDestination,
  SupplyQuoteItemDestinationValues,
  SupplyShippingType,
} from './types';

let destinationSequence = 0;

export function emptyFreightDestination(
  values: Partial<SupplyQuoteItemDestinationValues> = {},
): SupplyQuoteItemDestinationValues {
  destinationSequence += 1;
  return {
    key: `freight-destination-${destinationSequence}`,
    destinationType: values.destinationType || 'profile',
    profileId: values.profileId || '',
    storeId: values.storeId || '',
    label: values.label || '',
    state: values.state || '',
    destinationCount: values.destinationCount || 1,
    quantity: values.quantity || '0',
    unit: values.unit || 'un',
    shippingType: values.shippingType || 'pending',
    shippingAmount: values.shippingAmount || '',
    deliveryDays: values.deliveryDays || '',
    notes: values.notes || '',
  };
}

function scaledQuantityToString(value: bigint): string {
  const whole = value / 1000n;
  const fraction = String(value % 1000n).padStart(3, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : String(whole);
}

export function allocateQuantityByWeights(totalQuantity: string, weights: number[]): string[] {
  if (!weights.length) return [];
  if (weights.some((weight) => !Number.isInteger(weight) || weight <= 0)) {
    throw new Error('Pesos de destino invalidos');
  }
  const total = quantityToThousandths(totalQuantity);
  if (total <= 0n) throw new Error('Quantidade total invalida');
  const totalWeight = BigInt(weights.reduce((sum, weight) => sum + weight, 0));
  const raw = weights.map((weight, index) => {
    const numerator = total * BigInt(weight);
    return {
      index,
      value: numerator / totalWeight,
      remainder: numerator % totalWeight,
    };
  });
  let allocated = raw.reduce((sum, entry) => sum + entry.value, 0n);
  let remaining = total - allocated;
  const ranked = [...raw].sort(
    (a, b) =>
      Number(b.remainder - a.remainder) || a.index - b.index,
  );
  let cursor = 0;
  while (remaining > 0n) {
    raw[ranked[cursor % ranked.length].index].value += 1n;
    allocated += 1n;
    remaining -= 1n;
    cursor += 1;
  }
  return raw.map((entry) => scaledQuantityToString(entry.value));
}

export function inferShippingType(shippingAmount: string): SupplyShippingType {
  if (shippingAmount.trim() === '') return 'pending';
  const cents = Number(shippingAmount.replace(/\./g, '').replace(',', '.'));
  if (!Number.isFinite(cents) || cents < 0) throw new Error('Valor de frete invalido');
  return cents === 0 ? 'free' : 'informed';
}

export function destinationValuesFromSaved(
  destination: SupplyQuoteItemDestination,
): SupplyQuoteItemDestinationValues {
  return emptyFreightDestination({
    destinationType: destination.destinationType,
    profileId: destination.profileId || '',
    storeId: destination.storeId || '',
    label: destination.label,
    state: destination.state,
    destinationCount: destination.destinationCount,
    quantity: destination.quantity,
    unit: destination.unit,
    shippingType: destination.shippingType,
    shippingAmount: destination.shippingAmount || '',
    deliveryDays: destination.deliveryDays === null ? '' : String(destination.deliveryDays),
    notes: destination.notes || '',
  });
}

export interface FreightDestinationOption {
  destinationType: 'profile' | 'store';
  profileId: string;
  storeId: string;
  label: string;
  state: string;
  destinationCount: number;
  weight: number;
}

export function getProfileDestinationOptions(
  quoteStoreIds: string[],
  profiles: SupplyFreightProfile[],
  stores: Store[],
  itemStoreId = '',
): { options: FreightDestinationOption[]; uncoveredStoreIds: string[] } {
  const relevantStoreIds = itemStoreId ? [itemStoreId] : quoteStoreIds;
  const relevant = new Set(relevantStoreIds);
  const covered = new Set<string>();
  const options = profiles
    .filter((profile) => profile.active)
    .map((profile) => {
      const matching = profile.storeIds.filter((storeId) => relevant.has(storeId));
      matching.forEach((storeId) => covered.add(storeId));
      return { profile, matching };
    })
    .filter(({ matching }) => matching.length > 0)
    .map(({ profile, matching }) => ({
      destinationType: 'profile' as const,
      profileId: profile.id,
      storeId: '',
      label: `${profile.name} - ${profile.state}`,
      state: profile.state,
      destinationCount: matching.length,
      weight: matching.length,
    }));
  return {
    options,
    uncoveredStoreIds: relevantStoreIds.filter((storeId) => !covered.has(storeId)),
  };
}

export function getStoreDestinationOptions(
  quoteStoreIds: string[],
  stores: Store[],
  itemStoreId = '',
): FreightDestinationOption[] {
  const relevantStoreIds = new Set(itemStoreId ? [itemStoreId] : quoteStoreIds);
  return stores
    .filter((store) => relevantStoreIds.has(store.id))
    .map((store) => ({
      destinationType: 'store' as const,
      profileId: '',
      storeId: store.id,
      label: `${store.code} - ${store.name}`,
      state: store.state,
      destinationCount: 1,
      weight: 1,
    }));
}

export function buildDestinationValues(
  totalQuantity: string,
  unit: string,
  options: FreightDestinationOption[],
): SupplyQuoteItemDestinationValues[] {
  const quantities = allocateQuantityByWeights(
    totalQuantity,
    options.map((option) => option.weight),
  );
  return options.map((option, index) =>
    emptyFreightDestination({
      ...option,
      quantity: quantities[index],
      unit,
      shippingType: 'pending',
      shippingAmount: '',
    }),
  );
}
