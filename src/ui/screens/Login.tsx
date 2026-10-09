import React, { useState } from 'react';
import { AuthError, validateNew, type Account, type AuthService } from '../../auth/account';
import { LogoMark } from '../components/Logo';
import { Segmented } from '../components/Cards';

type Mode = 'signin' | 'signup';

export function LoginScreen({ auth, onAuthed }: { auth: AuthService; onAuthed: (a: Account) => void }) {
  const [mode, setMode] = useState<Mode>('signin');
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [googleNote, setGoogleNote] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (mode === 'signup') {
      const v = validateNew(username, password, confirm, name);
      if (v) return setError(v);
    } else if (!username.trim() || !password) {
      return setError('Enter your username and password.');
    }
    setBusy(true);
    try {
      const a = mode === 'signup' ? await auth.register(username, password, name) : await auth.login(username, password);
      onAuthed(a);
    } catch (err) {
      setError(err instanceof AuthError ? err.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <div className="login__glow" aria-hidden="true" />
      <main className="login__card">
        <div className="login__brand">
          <LogoMark size={64} />
          <h1 className="login__word">FITBITRACK</h1>
          <p className="login__tag">Your Fitbit data. Reimagined.</p>
        </div>

        <Segmented
          ariaLabel="Account"
          value={mode}
          onChange={(m) => {
            setMode(m);
            setError(null);
          }}
          options={[
            { value: 'signin', label: 'Sign in' },
            { value: 'signup', label: 'Create account' },
          ]}
        />

        <form className="login__form" onSubmit={submit} noValidate>
          {mode === 'signup' && (
            <label className="field">
              <span className="login__label">Your name</span>
              <input id="login-name" className="input" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Rodrigo" />
            </label>
          )}
          <label className="field">
            <span className="login__label">Username</span>
            <input id="login-user" className="input" autoComplete="username" autoCapitalize="none" spellCheck={false} value={username} onChange={(e) => setUsername(e.target.value)} placeholder="rodrigo.cg" />
          </label>
          <label className="field">
            <span className="login__label">Password</span>
            <span className="login__pw">
              <input
                id="login-pass"
                className="input"
                type={show ? 'text' : 'password'}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === 'signup' ? 'At least 8 characters' : '••••••••'}
              />
              <button type="button" className="login__show" onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'}>
                {show ? 'Hide' : 'Show'}
              </button>
            </span>
          </label>
          {mode === 'signup' && (
            <label className="field">
              <span className="login__label">Confirm password</span>
              <input id="login-confirm" className="input" type={show ? 'text' : 'password'} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </label>
          )}

          {error && (
            <div className="login__error" role="alert">
              {error}
            </div>
          )}

          <button className="btn btn--primary btn--block btn--xl" type="submit" disabled={busy}>
            {busy ? (mode === 'signup' ? 'Creating account…' : 'Signing in…') : mode === 'signup' ? 'Create account' : 'Sign in'}
          </button>
        </form>

        <div className="login__or">
          <span>or</span>
        </div>
        <button className="btn btn--ghost btn--block" type="button" onClick={() => (auth.kind === 'server' ? window.location.assign('/auth/google/start') : setGoogleNote(true))}>
          <span className="g-dot" aria-hidden="true">
            G
          </span>
          Continue with Google
        </button>
        {googleNote && <p className="fine login__note">Google sign-in works once the FITBITRACK server is running. For now, create an account with a username.</p>}

        <p className="fine login__foot">
          {auth.kind === 'device'
            ? 'In this preview your account is saved only on this device. Your password is never stored, only a secure hash.'
            : 'Your password is stored as a secure hash on the FITBITRACK server.'}
        </p>
      </main>
    </div>
  );
}
