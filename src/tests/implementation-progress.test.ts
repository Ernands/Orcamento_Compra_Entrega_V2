import { describe, expect, it } from 'vitest';
import { calculateProgress } from '../data/implementation/implementation-repository';
import type { ImplementationItem } from '../domain/types';

function item(
  status: ImplementationItem['status'],
  dueDate: string | null = null,
): ImplementationItem {
  return {
    id: crypto.randomUUID(),
    implementationId: 'implementation-1',
    title: 'Atividade',
    description: null,
    category: 'Obra',
    guidance: null,
    responsibilityType: null,
    evidenceRequired: false,
    priority: 'normal',
    position: 1,
    isRequired: true,
    status,
    responsibleUserId: null,
    responsibleName: null,
    dueDate,
    completedAt: status === 'completed' ? new Date().toISOString() : null,
    notes: null,
  };
}

describe('calculateProgress', () => {
  it('calcula totais, percentual e atraso sem persistir campos derivados', () => {
    const result = calculateProgress([
      item('completed'),
      item('in_progress'),
      item('blocked', '2020-01-01'),
      item('not_applicable'),
    ]);
    expect(result).toMatchObject({
      total: 3,
      completed: 1,
      inProgress: 1,
      blocked: 1,
      overdue: 1,
      percentage: 33,
    });
  });
});
