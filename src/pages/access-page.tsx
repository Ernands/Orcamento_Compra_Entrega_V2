import {
  Check,
  Edit3,
  KeyRound,
  LoaderCircle,
  Plus,
  Power,
  Search,
  Settings2,
  ShieldCheck,
  Store,
  UserRound,
} from 'lucide-react';
import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from '../app/session-provider';
import {
  EmptyState,
  ErrorState,
  IconButton,
  InlineLoading,
  Modal,
  StatusBadge,
} from '../components/ui';
import {
  createAccessUser,
  loadAccessAdminData,
  resetAccessUserPassword,
  saveAccessUserPermissions,
  updateAccessUser,
  type AccessAdminData,
} from '../data/access/access-repository';
import type {
  AccessFormValues,
  AccessPermission,
  AccessPermissionOverride,
  AccessUser,
  UserStatus,
} from '../domain/types';
import { formatCpfInput, isValidCpf, maskCpfLast4 } from '../../supabase/functions/_shared/cpf';

const emptyForm: AccessFormValues = {
  name: '',
  cpf: '',
  profileId: '',
  storeIds: [],
  allStores: false,
  status: 'active',
  initialPassword: '',
};

const financeOverviewOnlyHiddenKeys = new Set<AccessPermission['key']>([
  'finance.payments_view',
  'finance.stores_ufs_view',
  'finance.reimbursements_view',
]);

function permissionLabel(permission: AccessPermission): string {
  if (permission.key === 'finance.view') return 'Exibir o menu Financeiro';
  return permission.description;
}

function valuesFromUser(user: AccessUser): AccessFormValues {
  return {
    name: user.name,
    profileId: user.profile.id,
    storeIds: user.stores.map((store) => store.id),
    allStores: user.allStores,
    status: user.status,
  };
}

export function AccessPage() {
  const [data, setData] = useState<AccessAdminData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<AccessUser | 'new' | null>(null);
  const [form, setForm] = useState<AccessFormValues>(emptyForm);
  const [resetting, setResetting] = useState<AccessUser | null>(null);
  const [permissionUser, setPermissionUser] = useState<AccessUser | null>(null);
  const [permissionDraft, setPermissionDraft] = useState<
    Record<string, 'inherit' | 'grant' | 'deny'>
  >({});
  const [temporaryPassword, setTemporaryPassword] = useState('');
  const [temporaryPasswordConfirmation, setTemporaryPasswordConfirmation] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const { viewer, can } = useSession();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await loadAccessAdminData());
    } catch {
      setError('Nao foi possivel carregar os acessos.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const users = useMemo(() => {
    if (!data) return [];
    const search = query.trim().toLocaleLowerCase('pt-BR');
    if (!search) return data.users;
    return data.users.filter((user) =>
      [user.code, user.name, user.profile.name, ...user.stores.map((store) => store.name)]
        .join(' ')
        .toLocaleLowerCase('pt-BR')
        .includes(search),
    );
  }, [data, query]);

  const permissionGroups = useMemo(() => {
    if (!data) return [];
    const grouped = new Map<string, NonNullable<AccessAdminData['permissions']>>();
    (data.permissions || []).forEach((permission) => {
      const current = grouped.get(permission.moduleName) || [];
      current.push(permission);
      grouped.set(permission.moduleName, current);
    });
    return [...grouped.entries()].map(([moduleName, permissions]) => ({
      moduleName,
      moduleKey: permissions[0]?.moduleKey || '',
      permissions,
    }));
  }, [data]);

  const permissionIsInherited = useCallback(
    (permissionId: string) =>
      data?.profilePermissions?.some(
        (entry) =>
          entry.profileId === permissionUser?.profile.id && entry.permissionId === permissionId,
      ) || false,
    [data?.profilePermissions, permissionUser?.profile.id],
  );

  const showOnlyFinanceOverview = () => {
    const financePermissions =
      data?.permissions?.filter((permission) => permission.moduleKey === 'finance') || [];

    setPermissionDraft((current) => {
      const next = { ...current };

      financePermissions.forEach((permission) => {
        if (permission.key === 'finance.view' || permission.key === 'finance.overview_view') {
          next[permission.id] = permissionIsInherited(permission.id) ? 'inherit' : 'grant';
        } else if (financeOverviewOnlyHiddenKeys.has(permission.key)) {
          next[permission.id] = 'deny';
        }
      });

      return next;
    });
  };

  const openCreate = () => {
    setForm({ ...emptyForm, profileId: data?.profiles[0]?.id || '' });
    setFormError(null);
    setEditing('new');
  };

  const openEdit = (user: AccessUser) => {
    setForm(valuesFromUser(user));
    setFormError(null);
    setEditing(user);
  };

  const openPermissions = (user: AccessUser) => {
    const overrides = data?.userPermissionOverrides?.filter((entry) => entry.userId === user.id) || [];
    const nextDraft: Record<string, 'inherit' | 'grant' | 'deny'> = {};
    overrides.forEach((entry) => {
      nextDraft[entry.permissionId] = entry.effect;
    });
    setPermissionDraft(nextDraft);
    setFormError(null);
    setPermissionUser(user);
  };

  const savePermissions = async (event: FormEvent) => {
    event.preventDefault();
    if (!permissionUser) return;

    const overrides: AccessPermissionOverride[] = Object.entries(permissionDraft)
      .filter(([, effect]) => effect !== 'inherit')
      .map(([permissionId, effect]) => ({
        permissionId,
        effect: effect as AccessPermissionOverride['effect'],
      }));

    setSaving(true);
    setFormError(null);
    try {
      await saveAccessUserPermissions(permissionUser.id, overrides);
      setPermissionUser(null);
      setPermissionDraft({});
      setSuccess('Permissoes do usuario atualizadas.');
      await load();
    } catch {
      setFormError('Nao foi possivel atualizar as permissoes do usuario.');
    } finally {
      setSaving(false);
    }
  };

  const saveUser = async (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);

    if (!form.name.trim() || !form.profileId) {
      setFormError('Informe nome e perfil.');
      return;
    }
    if (editing === 'new' && (!form.cpf || !isValidCpf(form.cpf))) {
      setFormError('Informe um CPF valido.');
      return;
    }
    if (editing === 'new' && (form.initialPassword?.length || 0) < 10) {
      setFormError('A senha inicial deve ter pelo menos 10 caracteres.');
      return;
    }

    setSaving(true);
    try {
      if (editing === 'new') {
        await createAccessUser(form);
        setSuccess('Usuario criado com senha temporaria.');
      } else if (editing) {
        await updateAccessUser(editing.id, form);
        setSuccess('Acesso atualizado.');
      }
      setEditing(null);
      await load();
    } catch {
      setFormError('Nao foi possivel salvar. Verifique CPF, perfil e lojas.');
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (user: AccessUser) => {
    const nextStatus: UserStatus = user.status === 'active' ? 'inactive' : 'active';
    setSaving(true);
    setSuccess(null);
    try {
      await updateAccessUser(user.id, { ...valuesFromUser(user), status: nextStatus });
      setSuccess(nextStatus === 'active' ? 'Acesso ativado.' : 'Acesso inativado.');
      await load();
    } catch {
      setError('Nao foi possivel alterar o status do acesso.');
    } finally {
      setSaving(false);
    }
  };

  const resetPassword = async (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);
    if (temporaryPassword.length < 10) {
      setFormError('A nova senha deve ter pelo menos 10 caracteres.');
      return;
    }
    if (temporaryPassword !== temporaryPasswordConfirmation) {
      setFormError('A confirmacao nao corresponde a nova senha.');
      return;
    }
    if (!resetting) return;
    setSaving(true);
    try {
      await resetAccessUserPassword(resetting.id, temporaryPassword);
      setResetting(null);
      setTemporaryPassword('');
      setTemporaryPasswordConfirmation('');
      setSuccess('Senha alterada. A troca sera obrigatoria no proximo acesso.');
      await load();
    } catch {
      setFormError('Nao foi possivel redefinir a senha.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="page-stack">
      <header className="page-heading">
        <div>
          <p className="eyebrow">Administracao</p>
          <h2>Acessos</h2>
          <p>Usuarios, perfis e escopo de lojas.</p>
        </div>
        {can('access.create') && (
          <button className="button button--primary" onClick={openCreate}>
            <Plus size={18} />
            Novo usuario
          </button>
        )}
      </header>
      {success && (
        <div className="success-banner" role="status">
          <Check size={18} />
          {success}
          <button onClick={() => setSuccess(null)} aria-label="Fechar mensagem">
            Fechar
          </button>
        </div>
      )}
      <label className="search-field">
        <Search size={18} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar usuario, perfil ou loja"
          aria-label="Buscar acessos"
        />
      </label>
      {loading ? (
        <InlineLoading label="Carregando acessos" />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : users.length === 0 ? (
        <EmptyState
          title={data?.users.length ? 'Nenhum resultado' : 'Nenhum usuario cadastrado'}
          detail={
            data?.users.length
              ? 'Ajuste os termos da busca.'
              : 'Crie o primeiro acesso administrativo pelo procedimento seguro.'
          }
        />
      ) : (
        <div className="access-list">
          <div className="access-list__header">
            <span>Usuario</span>
            <span>Perfil</span>
            <span>Lojas</span>
            <span>Status</span>
            <span>Acoes</span>
          </div>
          {users.map((user) => (
            <article className="access-row" key={user.id}>
              <div className="access-user">
                <span className="avatar">
                  <UserRound size={17} />
                </span>
                <span>
                  <strong>{user.name}</strong>
                  <small>
                    {user.code} · {maskCpfLast4(user.cpfLast4)}
                  </small>
                </span>
              </div>
              <div className="access-cell" data-label="Perfil">
                <ShieldCheck size={16} />
                <span>{user.profile.name}</span>
              </div>
              <div className="access-cell access-cell--stores" data-label="Lojas">
                <Store size={16} />
                <span>
                  {user.allStores
                    ? 'Todas as lojas'
                    : user.stores.length
                      ? user.stores.map((store) => store.code).join(', ')
                      : 'Nenhuma loja'}
                </span>
              </div>
              <div data-label="Status">
                <StatusBadge status={user.status} />
                {user.mustChangePassword && (
                  <small className="temporary-label">Senha temporaria</small>
                )}
              </div>
              <div className="row-actions">
                {can('access.edit') && (
                  <IconButton label={`Editar ${user.name}`} onClick={() => openEdit(user)}>
                    <Edit3 size={18} />
                  </IconButton>
                )}
                {can('access.disable') && (
                  <IconButton
                    label={
                      user.status === 'active' ? `Inativar ${user.name}` : `Ativar ${user.name}`
                    }
                    onClick={() => void toggleStatus(user)}
                    disabled={saving || user.id === viewer?.id}
                  >
                    <Power size={18} />
                  </IconButton>
                )}
                {can('access.permissions_manage') && user.id !== viewer?.id && (
                  <button
                    type="button"
                    className="button button--secondary button--small access-permissions-button"
                    aria-label={`Editar permissoes de ${user.name}`}
                    onClick={() => openPermissions(user)}
                  >
                    <Settings2 size={15} />
                    Permissoes
                  </button>
                )}
                {can('access.reset_password') && (
                  <button
                    type="button"
                    className="button button--secondary button--small access-password-button"
                    aria-label={`Alterar senha de ${user.name}`}
                    onClick={() => {
                      setFormError(null);
                      setTemporaryPassword('');
                      setTemporaryPasswordConfirmation('');
                      setResetting(user);
                    }}
                  >
                    <KeyRound size={15} />
                    Alterar senha
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      <Modal
        open={editing !== null}
        title={editing === 'new' ? 'Novo usuario' : 'Editar acesso'}
        description={
          editing === 'new'
            ? 'A senha sera temporaria e devera ser alterada no primeiro acesso.'
            : 'Atualize perfil, status e lojas permitidas.'
        }
        onClose={() => setEditing(null)}
      >
        <form className="stack-form" onSubmit={saveUser}>
          <label className="field">
            <span>Nome</span>
            <input
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              required
            />
          </label>
          {editing === 'new' && (
            <label className="field">
              <span>CPF</span>
              <input
                inputMode="numeric"
                value={form.cpf}
                onChange={(event) =>
                  setForm((current) => ({ ...current, cpf: formatCpfInput(event.target.value) }))
                }
                placeholder="000.000.000-00"
                maxLength={14}
                required
              />
            </label>
          )}
          <label className="field">
            <span>Perfil</span>
            <select
              value={form.profileId}
              onChange={(event) =>
                setForm((current) => ({ ...current, profileId: event.target.value }))
              }
            >
              {data?.profiles.map((profile) => (
                <option value={profile.id} key={profile.id}>
                  {profile.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Status</span>
            <select
              value={form.status}
              onChange={(event) =>
                setForm((current) => ({ ...current, status: event.target.value as UserStatus }))
              }
            >
              <option value="active">Ativo</option>
              <option value="inactive">Inativo</option>
              <option value="blocked">Bloqueado</option>
            </select>
          </label>
          <label className="toggle-field">
            <input
              type="checkbox"
              checked={form.allStores}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  allStores: event.target.checked,
                  storeIds: event.target.checked ? [] : current.storeIds,
                }))
              }
            />
            <span>
              <strong>Acesso a todas as lojas</strong>
              <small>Use apenas quando o perfil realmente precisar de escopo global.</small>
            </span>
          </label>
          {!form.allStores && (
            <fieldset className="store-picker">
              <legend>Lojas permitidas</legend>
              {data?.stores.map((store) => (
                <label key={store.id}>
                  <input
                    type="checkbox"
                    checked={form.storeIds.includes(store.id)}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        storeIds: event.target.checked
                          ? [...current.storeIds, store.id]
                          : current.storeIds.filter((id) => id !== store.id),
                      }))
                    }
                  />
                  <span>
                    <strong>{store.code}</strong>
                    {store.name}
                  </span>
                </label>
              ))}
            </fieldset>
          )}
          {editing === 'new' && (
            <label className="field">
              <span>Senha inicial</span>
              <input
                type="password"
                autoComplete="new-password"
                value={form.initialPassword}
                onChange={(event) =>
                  setForm((current) => ({ ...current, initialPassword: event.target.value }))
                }
                minLength={10}
                required
              />
              <small>Nao sera armazenada na tabela de negocio.</small>
            </label>
          )}
          {formError && (
            <div className="form-error" role="alert">
              {formError}
            </div>
          )}
          <div className="form-actions">
            <button
              type="button"
              className="button button--secondary"
              onClick={() => setEditing(null)}
            >
              Cancelar
            </button>
            <button type="submit" className="button button--primary" disabled={saving}>
              {saving ? <LoaderCircle className="spin" size={18} /> : <Check size={18} />}
              {saving ? 'Salvando' : 'Salvar'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={permissionUser !== null}
        title="Permissoes do usuario"
        description={
          permissionUser
            ? `${permissionUser.name} · perfil ${permissionUser.profile.name}. Use Herdar para manter a regra do perfil.`
            : undefined
        }
        onClose={() => {
          setPermissionUser(null);
          setPermissionDraft({});
          setFormError(null);
        }}
        className="access-permissions-modal"
      >
        <form className="stack-form" onSubmit={savePermissions}>
          <div className="access-permissions-note">
            <ShieldCheck size={18} />
            <span>
              <strong>Herdar</strong> usa o perfil. <strong>Permitir</strong> concede apenas a este
              usuario. <strong>Bloquear</strong> prevalece sobre o perfil.
            </span>
          </div>
          <div className="access-permissions-groups">
            {permissionGroups.map((group) => (
              <section key={group.moduleName} className="access-permissions-group">
                <header>
                  <span>{group.moduleName}</span>
                  {group.moduleKey === 'finance' && (
                    <button
                      type="button"
                      className="access-permissions-group__action"
                      onClick={showOnlyFinanceOverview}
                    >
                      Apenas Visão Geral
                    </button>
                  )}
                </header>
                {group.moduleKey === 'finance' && (
                  <div className="access-permissions-group__hint">
                    Mantenha <strong>Exibir o menu Financeiro</strong> permitido. As permissoes de
                    Pagamentos, Lojas e UFs e Reembolsos controlam somente as respectivas abas.
                  </div>
                )}
                {group.permissions.map((permission) => {
                  const inherited = permissionIsInherited(permission.id);
                  const value = permissionDraft[permission.id] || 'inherit';
                  const label = permissionLabel(permission);
                  return (
                    <div
                      className={`access-permission-row${
                        permission.key === 'finance.view'
                          ? ' access-permission-row--module-access'
                          : ''
                      }`}
                      key={permission.id}
                    >
                      <div>
                        <strong>{label}</strong>
                        <small>{permission.key}</small>
                      </div>
                      <span
                        className={`access-inherited access-inherited--${
                          inherited ? 'allowed' : 'blocked'
                        }`}
                      >
                        Perfil: {inherited ? 'permitido' : 'bloqueado'}
                      </span>
                      <select
                        aria-label={`${label} para ${permissionUser?.name || 'usuario'}`}
                        value={value}
                        onChange={(event) =>
                          setPermissionDraft((current) => ({
                            ...current,
                            [permission.id]: event.target.value as 'inherit' | 'grant' | 'deny',
                          }))
                        }
                      >
                        <option value="inherit">
                          Herdar ({inherited ? 'permitido' : 'bloqueado'})
                        </option>
                        <option value="grant">Permitir</option>
                        <option value="deny">Bloquear</option>
                      </select>
                    </div>
                  );
                })}
              </section>
            ))}
          </div>
          {formError && (
            <div className="form-error" role="alert">
              {formError}
            </div>
          )}
          <div className="form-actions">
            <button
              type="button"
              className="button button--secondary"
              onClick={() => {
                setPermissionUser(null);
                setPermissionDraft({});
                setFormError(null);
              }}
            >
              Cancelar
            </button>
            <button type="submit" className="button button--primary" disabled={saving}>
              {saving ? <LoaderCircle className="spin" size={18} /> : <Check size={18} />}
              {saving ? 'Salvando' : 'Salvar permissoes'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={resetting !== null}
        title="Alterar senha do usuario"
        description={`Defina uma nova senha temporaria para ${resetting?.name || 'o usuario'}.`}
        onClose={() => {
          setResetting(null);
          setTemporaryPassword('');
          setTemporaryPasswordConfirmation('');
          setFormError(null);
        }}
      >
        <form className="stack-form" onSubmit={resetPassword}>
          <label className="field">
            <span>Nova senha</span>
            <input
              type="password"
              aria-label="Nova senha"
              autoComplete="new-password"
              value={temporaryPassword}
              onChange={(event) => setTemporaryPassword(event.target.value)}
              minLength={10}
              required
            />
            <small>A troca sera obrigatoria no proximo acesso.</small>
          </label>
          <label className="field">
            <span>Confirmar nova senha</span>
            <input
              type="password"
              aria-label="Confirmar nova senha"
              autoComplete="new-password"
              value={temporaryPasswordConfirmation}
              onChange={(event) => setTemporaryPasswordConfirmation(event.target.value)}
              minLength={10}
              required
            />
            <small>A senha nao e armazenada na tabela de negocio.</small>
          </label>
          {formError && (
            <div className="form-error" role="alert">
              {formError}
            </div>
          )}
          <div className="form-actions">
            <button
              type="button"
              className="button button--secondary"
              onClick={() => setResetting(null)}
            >
              Cancelar
            </button>
            <button className="button button--primary" type="submit" disabled={saving}>
              {saving ? <LoaderCircle className="spin" size={18} /> : <KeyRound size={18} />}
              {saving ? 'Alterando' : 'Alterar senha'}
            </button>
          </div>
        </form>
      </Modal>
    </section>
  );
}
