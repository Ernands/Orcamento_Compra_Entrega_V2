insert into public.modulos (chave, nome) values
  ('stores', 'Lojas'),
  ('access', 'Acessos');

insert into public.acoes (chave, nome) values
  ('view', 'Visualizar'),
  ('create', 'Criar'),
  ('edit', 'Editar'),
  ('delete', 'Excluir'),
  ('disable', 'Ativar ou inativar'),
  ('reset_password', 'Redefinir senha');

insert into public.permissoes (modulo_id, acao_id, chave, descricao)
select m.id, a.id, permission.chave, permission.descricao
from (values
  ('stores', 'view', 'stores.view', 'Visualizar lojas dentro do escopo concedido'),
  ('stores', 'create', 'stores.create', 'Criar lojas'),
  ('stores', 'edit', 'stores.edit', 'Editar lojas dentro do escopo concedido'),
  ('stores', 'delete', 'stores.delete', 'Excluir lojas quando a regra de negocio permitir'),
  ('access', 'view', 'access.view', 'Visualizar a administracao de acessos'),
  ('access', 'create', 'access.create', 'Criar usuarios'),
  ('access', 'edit', 'access.edit', 'Editar perfil e escopo de usuarios'),
  ('access', 'disable', 'access.disable', 'Ativar, inativar ou bloquear usuarios'),
  ('access', 'reset_password', 'access.reset_password', 'Redefinir senha de usuarios')
) as permission(modulo_chave, acao_chave, chave, descricao)
join public.modulos m on m.chave = permission.modulo_chave
join public.acoes a on a.chave = permission.acao_chave;

insert into public.perfis (chave, nome, descricao) values
  ('administrator', 'Administrador', 'Acesso completo a fundacao da V2.'),
  ('prospector', 'Prospector', 'Leitura das lojas concedidas; foco futuro em Implantacao.'),
  ('consultation', 'Consulta', 'Leitura das lojas concedidas, sem permissoes de escrita.');

insert into public.perfil_permissoes (perfil_id, permissao_id)
select profile.id, permission.id
from public.perfis profile
cross join public.permissoes permission
where profile.chave = 'administrator';

insert into public.perfil_permissoes (perfil_id, permissao_id)
select profile.id, permission.id
from public.perfis profile
join public.permissoes permission on permission.chave = 'stores.view'
where profile.chave in ('prospector', 'consultation');
