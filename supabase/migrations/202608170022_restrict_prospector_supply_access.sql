delete from public.perfil_permissoes pp
using public.perfis p, public.permissoes perm
where pp.perfil_id = p.id
  and pp.permissao_id = perm.id
  and p.chave = 'prospector'
  and perm.chave in (
    'items.view',
    'items.manage',
    'suppliers.view',
    'suppliers.manage',
    'quotes.view',
    'quotes.create',
    'quotes.edit'
  );
