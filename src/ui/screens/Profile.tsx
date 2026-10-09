import React, { useState } from 'react';
import { PERMISSIONS, useApp } from '../../state/store';
import { IconBell, IconChevron, IconDownload, IconShield, IconTrash } from '../components/Icons';
import { BandIcon } from '../components/Logo';
import { Segmented } from '../components/Cards';
import { fmtDuration, fmtNum } from '../../calc/stats';

function Toggle({ id, on, onChange, label }: { id: string; on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button id={id} role="switch" aria-checked={on} aria-label={label} className={`toggle ${on ? 'is-on' : ''}`} onClick={() => onChange(!on)} type="button">
      <span />
    </button>
  );
}

function Row({ label, value, children }: { label: string; value?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="prow">
      <span className="prow__label">{label}</span>
      {value != null && <span className="prow__value">{value}</span>}
      {children}
    </div>
  );
}

export function ProfileScreen() {
  const { analysis: a, permissions, setPermission, openSheet, theme, setTheme, account, logout } = useApp();
  const [notifs, setNotifs] = useState({ morning: true, bedtime: true, insights: false });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [exportState, setExportState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [deleted, setDeleted] = useState(false);
  if (!a) return null;
  const { ds } = a;
  const p = ds.profile;

  const exportData = async () => {
    const payload = JSON.stringify({ exportedAt: new Date().toISOString(), profile: p, days: ds.days, sleep: ds.sleep, exercises: ds.exercises, journal: ds.journal }, null, 1);
    try {
      await navigator.clipboard.writeText(payload);
      setExportState('copied');
    } catch {
      setExportState('failed');
    }
  };

  return (
    <div className="screen">
      <header className="profile-head">
        <span className="avatar">{p.name.slice(0, 1)}</span>
        <div>
          <h1 className="screen__title">{p.name}</h1>
          <p className="screen__sub">
            {ds.source.isSample ? 'Viewing sample data' : `Synced from ${ds.source.label}`}
          </p>
        </div>
      </header>

      <div className="profile-grid">
        {account && (
          <section className="card pcard">
            <div className="eyebrow">Account</div>
            <Row label="Name" value={account.displayName} />
            <Row label="Username" value={`@${account.username}`} />
            <Row label="Member since" value={new Date(account.createdAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })} />
            <button className="btn btn--ghost btn--block logout-btn" onClick={logout} type="button">
              Log out
            </button>
          </section>
        )}

        <BodyCard />

        <section className="card pcard">
          <div className="eyebrow">Goals</div>
          <Row label="Daily steps" value={fmtNum(p.stepGoal)} />
          <Row label="Sleep" value={fmtDuration(p.sleepGoalMin)} />
          <Row label="Training" value={p.trainingGoal === 'build' ? 'Build fitness' : p.trainingGoal === 'peak' ? 'Peak performance' : 'Maintain'} />
        </section>

        <section className="card pcard">
          <div className="eyebrow">Connected devices</div>
          {ds.devices.map((d) => (
            <div className="device" key={d.id}>
              <BandIcon size={24} />
              <div>
                <div className="device__name">{d.name}</div>
                <div className="fine">
                  {d.battery != null ? `Battery ${d.battery}% · ` : ''}
                  {d.lastSync ? `Synced ${Math.max(1, Math.round((Date.now() - new Date(d.lastSync).getTime()) / 60000))} min ago` : 'Not synced yet'}
                </div>
              </div>
            </div>
          ))}
          <button className="prow prow--btn" onClick={() => openSheet('connect')} type="button">
            <span className="prow__label">Google Health connection</span>
            <span className={`status ${ds.source.isSample ? 'status--off' : 'status--on'}`}>{ds.source.isSample ? 'Not connected' : 'Connected'}</span>
            <IconChevron size={16} />
          </button>
        </section>

        <section className="card pcard pcard--tall">
          <div className="eyebrow">Data permissions</div>
          <p className="fine">Turn a type off and FITBITRACK stops using it everywhere: scores re-weight and the metric shows as not available.</p>
          {PERMISSIONS.map((perm) => (
            <Row key={perm.key} label={perm.label}>
              <span className="prow__detail">{perm.detail}</span>
              <Toggle id={`perm-${perm.key}`} label={perm.label} on={permissions[perm.key]} onChange={(v) => setPermission(perm.key, v)} />
            </Row>
          ))}
        </section>

        <section className="card pcard">
          <div className="eyebrow">Preferences</div>
          <div className="appearance">
            <span className="prow__label">Appearance</span>
            <Segmented
              ariaLabel="Appearance"
              value={theme}
              onChange={setTheme}
              options={[
                { value: 'auto', label: 'Auto' },
                { value: 'light', label: 'Day' },
                { value: 'dark', label: 'Night' },
              ]}
            />
          </div>
          <Row label="Units" value="Metric · °C · km" />
          <div className="eyebrow eyebrow--sp">
            <IconBell size={14} /> Notifications
          </div>
          <Row label="Morning readiness">
            <Toggle id="n-morning" label="Morning readiness" on={notifs.morning} onChange={(v) => setNotifs({ ...notifs, morning: v })} />
          </Row>
          <Row label="Bedtime reminder">
            <Toggle id="n-bed" label="Bedtime reminder" on={notifs.bedtime} onChange={(v) => setNotifs({ ...notifs, bedtime: v })} />
          </Row>
          <Row label="New insights">
            <Toggle id="n-ins" label="New insights" on={notifs.insights} onChange={(v) => setNotifs({ ...notifs, insights: v })} />
          </Row>
        </section>

        <section className="card pcard">
          <div className="eyebrow">Your data</div>
          <button className="prow prow--btn" onClick={() => openSheet('privacy')} type="button">
            <IconShield size={18} />
            <span className="prow__label">Privacy</span>
            <IconChevron size={16} />
          </button>
          <button className="prow prow--btn" onClick={exportData} type="button">
            <IconDownload size={18} />
            <span className="prow__label">Export data</span>
            <span className="fine">{exportState === 'copied' ? 'Copied as JSON' : exportState === 'failed' ? 'Copy blocked here' : 'JSON'}</span>
          </button>
          {!confirmDelete ? (
            <button className="prow prow--btn prow--danger" onClick={() => setConfirmDelete(true)} type="button">
              <IconTrash size={18} />
              <span className="prow__label">{deleted ? 'Deletion requested' : 'Delete account'}</span>
            </button>
          ) : (
            <div className="confirm">
              <p>This removes your FITBITRACK account, journal and stored tokens. Your Fitbit data in Google stays untouched.</p>
              <div className="confirm__row">
                <button className="btn btn--ghost" onClick={() => setConfirmDelete(false)} type="button">
                  Cancel
                </button>
                <button
                  className="btn btn--danger"
                  onClick={() => {
                    setConfirmDelete(false);
                    setDeleted(true);
                  }}
                  type="button"
                >
                  Delete account
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function BodyCard() {
  const { analysis: a, body, setBody } = useApp();
  const [edit, setEdit] = useState(false);
  const p = a!.ds.profile;
  const [f, setF] = useState({ age: '', heightCm: '', weightKg: '' });
  const start = () => {
    setF({ age: String(p.age || ''), heightCm: p.heightCm ? String(p.heightCm) : '', weightKg: p.weightKg ? String(Math.round(p.weightKg * 10) / 10) : '' });
    setEdit(true);
  };
  const save = () => {
    const num = (v: string, lo: number, hi: number) => {
      const n = parseFloat(v.replace(',', '.'));
      return Number.isFinite(n) && n >= lo && n <= hi ? n : undefined;
    };
    setBody({ age: num(f.age, 10, 110), heightCm: num(f.heightCm, 100, 250), weightKg: num(f.weightKg, 30, 300) });
    setEdit(false);
  };
  const manual = Object.keys(body).some((k) => (body as any)[k]);
  return (
    <section className="card pcard">
      <div className="row-between">
        <div className="eyebrow">You</div>
        {!edit && (
          <button className="btn btn--ghost btn--sm" onClick={start} type="button">
            Edit
          </button>
        )}
      </div>
      {edit ? (
        <form
          className="body-form"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <label className="field">
            <span className="eyebrow">Age</span>
            <input className="input" inputMode="numeric" value={f.age} onChange={(e) => setF({ ...f, age: e.target.value })} />
          </label>
          <label className="field">
            <span className="eyebrow">Height (cm)</span>
            <input className="input" inputMode="decimal" value={f.heightCm} onChange={(e) => setF({ ...f, heightCm: e.target.value })} placeholder="178" />
          </label>
          <label className="field">
            <span className="eyebrow">Weight (kg)</span>
            <input className="input" inputMode="decimal" value={f.weightKg} onChange={(e) => setF({ ...f, weightKg: e.target.value })} placeholder="80" />
          </label>
          <div className="body-form__actions">
            <button className="btn btn--ghost" type="button" onClick={() => setEdit(false)}>
              Cancel
            </button>
            <button className="btn btn--primary" type="submit">
              Save
            </button>
          </div>
        </form>
      ) : (
        <>
          <Row label="Age" value={p.age ? `${p.age}` : '—'} />
          <Row label="Height" value={p.heightCm > 0 ? `${p.heightCm} cm` : 'Not set'} />
          <Row label="Weight" value={p.weightKg > 0 ? `${fmtNum(p.weightKg, 1)} kg` : 'Not set'} />
          <Row label="Max heart rate" value={`${p.maxHr} bpm`} />
          <p className="fine">{manual ? 'Edited by you. Used for Fitbit Age, calories context and the coach.' : 'From Google Health when available. Tap Edit to set or correct it.'}</p>
        </>
      )}
    </section>
  );
}
