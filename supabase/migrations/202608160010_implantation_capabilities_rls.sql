insert into public.modulos (chave, nome) values
  ('checklists', 'Checklist Mestre'),
  ('implementation', 'Implantacao'),
  ('needs', 'Necessidades'),
  ('attachments', 'Anexos');

insert into public.acoes (chave, nome) values
  ('manage', 'Administrar');

insert into public.permissoes (modulo_id, acao_id, chave, descricao)
select module.id, action.id, permission.key, permission.description
from (values
  ('checklists', 'view', 'checklists.view', 'Visualizar versoes do Checklist Mestre'),
  ('checklists', 'manage', 'checklists.manage', 'Criar, editar e publicar o Checklist Mestre'),
  ('implementation', 'view', 'implementation.view', 'Visualizar implantacoes das lojas acessiveis'),
  ('implementation', 'edit', 'implementation.edit', 'Iniciar e atualizar implantacoes das lojas acessiveis'),
  ('needs', 'view', 'needs.view', 'Visualizar necessidades das lojas acessiveis'),
  ('needs', 'create', 'needs.create', 'Criar necessidades nas lojas acessiveis'),
  ('needs', 'edit', 'needs.edit', 'Editar necessidades nas lojas acessiveis'),
  ('attachments', 'view', 'attachments.view', 'Visualizar anexos das lojas acessiveis'),
  ('attachments', 'create', 'attachments.create', 'Enviar anexos para as lojas acessiveis'),
  ('attachments', 'delete', 'attachments.delete', 'Remover anexos das lojas acessiveis')
) as permission(module_key, action_key, key, description)
join public.modulos module on module.chave = permission.module_key
join public.acoes action on action.chave = permission.action_key;

insert into public.perfil_permissoes (perfil_id, permissao_id)
select profile.id, permission.id
from public.perfis profile
cross join public.permissoes permission
where profile.chave = 'administrator'
  and permission.chave in (
    'checklists.view', 'checklists.manage',
    'implementation.view', 'implementation.edit',
    'needs.view', 'needs.create', 'needs.edit',
    'attachments.view', 'attachments.create', 'attachments.delete'
  );

insert into public.perfil_permissoes (perfil_id, permissao_id)
select profile.id, permission.id
from public.perfis profile
join public.permissoes permission on permission.chave in (
  'implementation.view', 'implementation.edit',
  'needs.view', 'needs.create', 'needs.edit',
  'attachments.view', 'attachments.create', 'attachments.delete'
)
where profile.chave = 'prospector';

insert into public.perfil_permissoes (perfil_id, permissao_id)
select profile.id, permission.id
from public.perfis profile
join public.permissoes permission on permission.chave in (
  'implementation.view', 'needs.view', 'attachments.view'
)
where profile.chave = 'consultation';

create policy checklist_versions_read_capability
on public.checklist_master_versions for select to authenticated
using (
  app.can('checklists', 'view')
  or (status = 'published' and app.can('implementation', 'view'))
);

create policy checklist_versions_create_manage
on public.checklist_master_versions for insert to authenticated
with check (
  app.can('checklists', 'manage')
  and status = 'draft'
  and (created_by is null or created_by = app.current_usuario_id())
);

create policy checklist_versions_update_manage
on public.checklist_master_versions for update to authenticated
using (app.can('checklists', 'manage'))
with check (app.can('checklists', 'manage'));

create policy checklist_versions_delete_draft_manage
on public.checklist_master_versions for delete to authenticated
using (app.can('checklists', 'manage') and status = 'draft');

create policy checklist_items_read_capability
on public.checklist_master_items for select to authenticated
using (
  exists (
    select 1
    from public.checklist_master_versions version
    where version.id = checklist_master_items.version_id
      and (
        app.can('checklists', 'view')
        or (version.status = 'published' and app.can('implementation', 'view'))
      )
  )
);

create policy checklist_items_create_draft_manage
on public.checklist_master_items for insert to authenticated
with check (
  app.can('checklists', 'manage')
  and exists (
    select 1 from public.checklist_master_versions version
    where version.id = checklist_master_items.version_id and version.status = 'draft'
  )
);

create policy checklist_items_update_draft_manage
on public.checklist_master_items for update to authenticated
using (
  app.can('checklists', 'manage')
  and exists (
    select 1 from public.checklist_master_versions version
    where version.id = checklist_master_items.version_id and version.status = 'draft'
  )
)
with check (
  app.can('checklists', 'manage')
  and exists (
    select 1 from public.checklist_master_versions version
    where version.id = checklist_master_items.version_id and version.status = 'draft'
  )
);

create policy checklist_items_delete_draft_manage
on public.checklist_master_items for delete to authenticated
using (
  app.can('checklists', 'manage')
  and exists (
    select 1 from public.checklist_master_versions version
    where version.id = checklist_master_items.version_id and version.status = 'draft'
  )
);

create policy implementations_read_scoped
on public.store_implementations for select to authenticated
using (app.can_store('implementation', 'view', store_id));

create policy implementations_create_scoped
on public.store_implementations for insert to authenticated
with check (
  app.can_store('implementation', 'edit', store_id)
  and (created_by is null or created_by = app.current_usuario_id())
);

create policy implementations_update_scoped
on public.store_implementations for update to authenticated
using (app.can_store('implementation', 'edit', store_id))
with check (
  app.can_store('implementation', 'edit', store_id)
  and (updated_by is null or updated_by = app.current_usuario_id())
);

create policy implementation_items_read_scoped
on public.store_implementation_items for select to authenticated
using (
  exists (
    select 1
    from public.store_implementations implementation
    where implementation.id = store_implementation_items.implementation_id
      and app.can_store('implementation', 'view', implementation.store_id)
  )
);

create policy implementation_items_update_scoped
on public.store_implementation_items for update to authenticated
using (
  exists (
    select 1
    from public.store_implementations implementation
    where implementation.id = store_implementation_items.implementation_id
      and app.can_store('implementation', 'edit', implementation.store_id)
  )
)
with check (
  exists (
    select 1
    from public.store_implementations implementation
    where implementation.id = store_implementation_items.implementation_id
      and app.can_store('implementation', 'edit', implementation.store_id)
  )
);

create policy needs_read_scoped
on public.store_needs for select to authenticated
using (app.can_store('needs', 'view', store_id));

create policy needs_create_scoped
on public.store_needs for insert to authenticated
with check (
  app.can_store('needs', 'create', store_id)
  and (created_by is null or created_by = app.current_usuario_id())
);

create policy needs_update_scoped
on public.store_needs for update to authenticated
using (app.can_store('needs', 'edit', store_id))
with check (
  app.can_store('needs', 'edit', store_id)
  and (updated_by is null or updated_by = app.current_usuario_id())
);

create policy attachments_read_scoped
on public.store_attachments for select to authenticated
using (deleted_at is null and app.can_store('attachments', 'view', store_id));

revoke all on table public.checklist_master_versions from anon, authenticated;
revoke all on table public.checklist_master_items from anon, authenticated;
revoke all on table public.store_implementations from anon, authenticated;
revoke all on table public.store_implementation_items from anon, authenticated;
revoke all on table public.store_needs from anon, authenticated;
revoke all on table public.store_attachments from anon, authenticated;

grant select, insert, update, delete on table public.checklist_master_versions to authenticated;
grant select, insert, update, delete on table public.checklist_master_items to authenticated;
grant select on table public.store_implementations to authenticated;
grant select on table public.store_implementation_items to authenticated;
grant select, insert, update on table public.store_needs to authenticated;
grant select on table public.store_attachments to authenticated;
grant usage, select on sequence public.checklist_master_version_seq to authenticated;

grant all on table public.checklist_master_versions to service_role;
grant all on table public.checklist_master_items to service_role;
grant all on table public.store_implementations to service_role;
grant all on table public.store_implementation_items to service_role;
grant all on table public.store_needs to service_role;
grant all on table public.store_attachments to service_role;
grant all on sequence public.checklist_master_version_seq to service_role;
