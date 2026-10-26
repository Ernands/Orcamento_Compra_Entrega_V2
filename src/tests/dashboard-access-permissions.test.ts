import { describe, expect, it } from 'vitest';
import { authorizedHomePath } from '../app/guards';
import type { Capability } from '../domain/types';
import migration from '../../supabase/migrations/20261026125333_dashboard_tab_reimbursement_permissions.sql?raw';
import app from '../app/app.tsx?raw';
import shell from '../app/app-shell.tsx?raw';
import access from '../pages/access-page.tsx?raw';
import reimbursement from '../pages/managerial-reimbursement-page.tsx?raw';
import closureFix from '../../supabase/migrations/20261026125333_dashboard_tab_reimbursement_permissions.sql?raw';

const base: Capability[]=['dashboard.view','finance.overview_view'];

describe('permissões independentes dos dashboards gerenciais',()=>{
  it('exige uma permissão própria para cada nova aba, na rota e no menu',()=>{
    expect(app).toContain('capability="dashboard.budget_forecast_view"');
    expect(app).toContain('capability="dashboard.financial_composition_view"');
    expect(app).toContain('capability="dashboard.reimbursement_view"');
    expect(shell).toContain("can('dashboard.budget_forecast_view')");
    expect(shell).toContain("can('dashboard.financial_composition_view')");
    expect(shell).toContain("can('dashboard.reimbursement_view')");
    expect(migration).toContain("'dashboard.budget_forecast_view'");
    expect(migration).toContain("'dashboard.financial_composition_view'");
    expect(migration).toContain("'dashboard.reimbursement_view'");
    expect(migration).toContain("'dashboard.reimbursement_manage'");
  });

  it('não redireciona para uma aba cuja permissão foi revogada',()=>{
    expect(authorizedHomePath([...base,'dashboard.budget_forecast_view']))
      .toBe('/dashboard/previsao-orcamentaria');
    expect(authorizedHomePath([...base,'dashboard.financial_composition_view']))
      .toBe('/dashboard/composicao-financeira');
    expect(authorizedHomePath([...base,'dashboard.reimbursement_view']))
      .toBe('/dashboard/reembolso');
    expect(authorizedHomePath([...base,'stores.view']))
      .toBe('/lojas');
  });

  it('separa visualização, movimentações e bloqueio financeiro da loja',()=>{
    expect(reimbursement).toContain("can('dashboard.reimbursement_manage')");
    expect(reimbursement).toContain("can('dashboard.reimbursement_view')");
    expect(reimbursement).toContain("can('stores.finalize_reopen')");
    expect(reimbursement).not.toContain("can('finance.manage')");
    expect(migration).toContain("app.can_store('dashboard','reimbursement_manage',store_id)");
    expect(migration).toContain("app.can_store('dashboard','reimbursement_view',store_id)");
    expect(migration).toContain("and created_by=app.current_usuario_id()");
    expect(closureFix).toContain("app.can_store('dashboard','reimbursement_manage',p_store_id)");
    expect(closureFix).toContain("app.can('stores','finalize_reopen')");
    expect(closureFix).not.toContain("app.can_store('finance','manage',p_store_id)");
    expect(closureFix).toContain("perform public.change_store_financial_closure(");
  });

  it('oferece as opções no cadastro de usuários e preserva a permissão de bloqueio',()=>{
    expect(access).toContain('Finalizar/Reabrir Loja — bloquear movimentações financeiras');
    expect(access).toContain('Previsão Orçamentária, Composição Financeira e Reembolso');
    expect(access).toContain('grupo Lojas');
    expect(access).toContain('permissionGroups.map');
    expect(migration).toContain("pf.chave='administrator'");
    expect(migration).toContain('on conflict do nothing');
  });
});
