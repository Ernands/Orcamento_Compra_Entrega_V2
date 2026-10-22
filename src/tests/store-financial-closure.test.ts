import { describe, expect, it } from 'vitest';
import migration from '../../supabase/migrations/20261022180600_store_financial_closure.sql?raw';
import page from '../pages/store-detail-page.tsx?raw';
import storesPage from '../pages/stores-page.tsx?raw';
import finance from '../pages/finance-page.tsx?raw';
import payments from '../pages/finance-payments-page.tsx?raw';
import works from '../pages/works-page.tsx?raw';
import repository from '../data/stores/store-financial-closure-repository.ts?raw';

describe('fechamento financeiro por loja (migração isolada em DEV)', () => {
  it('usa estado financeiro separado do status operacional da loja', () => {
    expect(migration).toContain('CREATE TABLE public.store_financial_closures');
    expect(migration).toContain("CHECK(state IN ('open','closed'))");
    expect(migration).not.toContain('ALTER TABLE public.lojas ADD COLUMN status');
    expect(repository).toContain("base(id, 'unavailable')");
  });
  it('usa RPC com permissao verificavel e confirmacao de duas etapas', () => {
    expect(migration).toContain("'stores','finalize_reopen'");
    expect(migration).toContain("'FINALIZAR' ELSE 'REABRIR'");
    expect(migration).toContain('auth.uid() IS NULL');
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.change_store_financial_closure');
    expect(page).toContain('confirmation !== expected');
    expect(page).toContain("reason.trim().length < 10");
    expect(page).toContain("can('stores.finalize_reopen')");
  });
  it('garante guarda transacional no banco contra gravacoes em outras rotas', () => {
    expect(migration).toContain('FOR SHARE');
    expect(migration).toContain('FOR UPDATE');
    expect(migration).toContain('private.guard_store_financial_changes()');
    for (const table of [
      'supply_purchases', 'supply_purchase_order_line_stores', 'supply_purchase_payments',
      'supply_purchase_payment_occurrences', 'works_services', 'works_service_payments',
      'works_service_components', 'finance_reimbursement_items',
    ]) expect(migration).toContain("'"+table+"'");
    expect(migration).toContain('Esta loja está finalizada e não permite novas movimentações financeiras.');
    expect(migration).toContain('private.finance_purchase_store_ids');
    expect(migration).toContain('SELECT to_jsonb(OLD)');
  });
  it('mantem historico append-only e aceita documentos novos sem permitir substituicao', () => {
    expect(migration).toContain('CREATE TABLE public.store_financial_closure_events');
    expect(migration).toContain('BEFORE UPDATE OR DELETE ON public.works_service_documents');
    expect(migration).toContain('BEFORE UPDATE OR DELETE ON public.supply_purchase_attachments');
    expect(migration).toContain('AFTER INSERT ON public.works_service_documents');
    expect(page).toContain('listStoreFinancialClosureEvents');
    expect(page).toContain('Historico de fechamento');
  });
  it('sinaliza consistentemente os fechamentos e oculta acoes financeiras', () => {
    expect(storesPage).toContain('store-close-badge--closed');
    expect(finance).toContain('Status da loja');
    expect(finance).toContain('Finalizadas');
    expect(payments).toContain('belongsToClosedStore');
    expect(payments).toContain("!belongsToClosedStore");
    expect(works).toContain('!isClosed');
    expect(works).toContain('Loja Finalizada');
  });
});
