import { CheckCircle2, KeyRound, LoaderCircle } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../app/session-provider';
import { changeOwnPassword } from '../data/auth/auth-repository';

export function ChangePasswordPage() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { viewer, refreshViewer } = useSession();
  const navigate = useNavigate();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (newPassword.length < 10) {
      setError('A nova senha deve ter pelo menos 10 caracteres.');
      return;
    }
    if (newPassword !== confirmation) {
      setError('A confirmacao nao corresponde a nova senha.');
      return;
    }
    setSaving(true);
    try {
      await changeOwnPassword(currentPassword, newPassword);
      await refreshViewer();
      void navigate('/lojas', { replace: true, state: { passwordChanged: true } });
    } catch {
      setError('Nao foi possivel alterar a senha. Confira a senha atual.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="narrow-page">
      <header className="page-heading">
        <div>
          <p className="eyebrow">Seguranca da conta</p>
          <h2>Alterar senha</h2>
          <p>
            {viewer?.mustChangePassword
              ? 'Defina uma nova senha para liberar o acesso.'
              : 'Confirme sua senha atual antes de criar uma nova.'}
          </p>
        </div>
      </header>
      <form className="form-panel" onSubmit={submit}>
        {viewer?.mustChangePassword && (
          <div className="notice">
            <KeyRound size={19} />
            <span>Este acesso utiliza uma senha temporaria.</span>
          </div>
        )}
        <label className="field">
          <span>Senha atual</span>
          <input
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            required
          />
        </label>
        <label className="field">
          <span>Nova senha</span>
          <input
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            minLength={10}
            required
          />
          <small>Use pelo menos 10 caracteres.</small>
        </label>
        <label className="field">
          <span>Confirmar nova senha</span>
          <input
            type="password"
            autoComplete="new-password"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            required
          />
        </label>
        {error && (
          <div className="form-error" role="alert">
            {error}
          </div>
        )}
        <button className="button button--primary" type="submit" disabled={saving}>
          {saving ? <LoaderCircle className="spin" size={18} /> : <CheckCircle2 size={18} />}
          {saving ? 'Salvando' : 'Salvar nova senha'}
        </button>
      </form>
    </section>
  );
}
