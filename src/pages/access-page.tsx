import {
  Check,
  Edit3,
  KeyRound,
  LoaderCircle,
  Plus,
  Power,
  Search,
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
  updateAccessUser,
  type AccessAdminData,
} from '../data/access/access-repository';
import type { AccessFormValues, AccessUser, UserStatus } from '../domain/types';
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
  const [temporaryPassword, setTemporaryPassword] = useState('');
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
      setFormError('A senha temporaria deve ter pelo menos 10 caracteres.');
      return;
    }
    if (!resetting) return;
    setSaving(true);
    try {
      await resetAccessUserPassword(resetting.id, temporaryPassword);
      setResetting(null);
      setTemporaryPassword('');
      setSuccess('Senha redefinida. A troca sera obrigatoria no proximo acesso.');
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
                {can('access.reset_password') && (
                  <IconButton
                    label={`Redefinir senha de ${user.name}`}
                    onClick={() => {
                      setFormError(null);
                      setTemporaryPassword('');
                      setResetting(user);
                    }}
                  >
                    <KeyRound size={18} />
                  </IconButton>
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
        open={resetting !== null}
        title="Redefinir senha"
        description={`Defina uma senha temporaria para ${resetting?.name || 'o usuario'}.`}
        onClose={() => setResetting(null)}
      >
        <form className="stack-form" onSubmit={resetPassword}>
          <label className="field">
            <span>Nova senha temporaria</span>
            <input
              type="password"
              autoComplete="new-password"
              value={temporaryPassword}
              onChange={(event) => setTemporaryPassword(event.target.value)}
              minLength={10}
              required
            />
            <small>A troca sera obrigatoria no proximo acesso.</small>
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
              {saving ? 'Redefinindo' : 'Redefinir senha'}
            </button>
          </div>
        </form>
      </Modal>
    </section>
  );
}
