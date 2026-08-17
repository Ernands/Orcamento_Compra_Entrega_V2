import type { SupplierChannelType } from './types';

export const SUPPLY_CATEGORIES = [
  'Mobiliario',
  'Informatica',
  'Eletrica',
  'Comunicacao Visual',
  'Construcao',
  'Acessibilidade',
  'Seguranca',
  'Limpeza',
  'Copa',
  'Equipamentos',
  'Servicos',
  'Outros',
];

export const BRAZIL_STATES = [
  'AC',
  'AL',
  'AP',
  'AM',
  'BA',
  'CE',
  'DF',
  'ES',
  'GO',
  'MA',
  'MT',
  'MS',
  'MG',
  'PA',
  'PB',
  'PR',
  'PE',
  'PI',
  'RJ',
  'RN',
  'RS',
  'RO',
  'RR',
  'SC',
  'SP',
  'SE',
  'TO',
];

export const SUPPLIER_CHANNEL_LABELS: Record<SupplierChannelType, string> = {
  local_city: 'Cidade da Loja',
  state_capital: 'Capital do Estado',
  regional: 'Regional',
  national: 'Nacional',
  ecommerce: 'E-commerce',
};
