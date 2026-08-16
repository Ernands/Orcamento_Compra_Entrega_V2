import { Eye, EyeOff, KeyRound, LoaderCircle, LogIn, ShieldCheck } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { EdgeFunctionError } from '../lib/edge-function';
import { useSession } from '../app/session-provider';
import { formatCpfInput, isValidCpf } from '../../supabase/functions/_shared/cpf';

interface LoginLocationState {
  from?: string;
}

function loginMessage(error: unknown): string {
  if (error instanceof EdgeFunctionError) {
    if (error.code === 'RATE_LIMITED') return 'Muitas tentativas. Aguarde alguns minutos.';
    if (error.code === 'ACCOUNT_INACTIVE')
      return 'Este acesso esta inativo. Fale com o administrador.';
    if (error.code === 'ACCOUNT_BLOCKED')
      return 'Este acesso esta bloqueado. Fale com o administrador.';
  }
  return 'CPF ou senha invalidos.';
}

export function LoginPage() {
  const [cpf, setCpf] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { session, viewer, loading, login } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as LoginLocationState | null)?.from || '/lojas';

  useEffect(() => {
    document.title = 'Entrar | Implanta 27';
  }, []);

  if (!loading && session && viewer) {
    return <Navigate to={viewer.mustChangePassword ? '/alterar-senha' : from} replace />;
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!isValidCpf(cpf) || !password) {
      setError('CPF ou senha invalidos.');
      return;
    }

    setSubmitting(true);
    try {
      await login(cpf, password);
      void navigate(from, { replace: true });
    } catch (loginError) {
      setError(loginMessage(loginError));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="login-page">
      <section className="login-brand" aria-label="Implanta 27">
        <div className="login-brand__content">
          <span className="login-brand__mark">
            <ShieldCheck size={30} />
          </span>
          <p className="login-brand__kicker">Operacao das 27 lojas</p>
          <h1>Implanta 27</h1>
          <p>Implantacao, Compra & entrega</p>
        </div>
        <div className="login-brand__footer">
          <KeyRound size={18} />
          Acesso protegido por CPF e senha
        </div>
      </section>
      <section className="login-form-section">
        <form className="login-form" onSubmit={handleSubmit} noValidate>
          <header>
            <span>Acesso ao sistema</span>
            <h2>Bem-vindo</h2>
            <p>Informe suas credenciais para continuar.</p>
          </header>
          <label className="field">
            <span>CPF</span>
            <input
              inputMode="numeric"
              autoComplete="username"
              placeholder="000.000.000-00"
              value={cpf}
              onChange={(event) => setCpf(formatCpfInput(event.target.value))}
              maxLength={14}
              autoFocus
            />
          </label>
          <label className="field">
            <span>Senha</span>
            <span className="password-input">
              <input
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              <button
                type="button"
                className="icon-button"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </span>
          </label>
          {error && (
            <div className="form-error" role="alert">
              {error}
            </div>
          )}
          <button
            className="button button--primary button--full"
            type="submit"
            disabled={submitting}
          >
            {submitting ? <LoaderCircle className="spin" size={19} /> : <LogIn size={19} />}
            {submitting ? 'Entrando' : 'Entrar'}
          </button>
        </form>
      </section>
    </main>
  );
}
