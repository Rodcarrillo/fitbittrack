import React, { useState } from 'react';
import { useWorkouts, type HevySyncResult } from '../../workouts/store';
import { BackBar } from './WorkoutsTab';
import { IconChevron, IconRefresh } from '../components/Icons';

const ago = (iso?: string) => {
  if (!iso) return 'never';
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};

export function HevyMark({ size = 28 }: { size?: number }) {
  return (
    <span className="hevymark" style={{ width: size, height: size, fontSize: size * 0.5 }} aria-hidden="true">
      H
    </span>
  );
}

/** Compact status card shown on the Workouts home. */
export function HevyCard() {
  const { hevy, hevyBusy, syncHevy, openPage } = useWorkouts();
  return (
    <div className="card hevycard">
      <HevyMark />
      <button className="hevycard__main" onClick={() => openPage({ kind: 'hevy' })} type="button">
        <b>Hevy</b>
        <span className="fine">{hevy.connected ? `Synced ${ago(hevy.lastSync)}${hevy.username ? ` · @${hevy.username}` : ''}` : 'Import your Hevy workouts (free CSV or Pro sync)'}</span>
      </button>
      {hevy.connected ? (
        <button className={`icon-btn ${hevyBusy ? 'is-spinning' : ''}`} onClick={() => syncHevy()} aria-label="Sync with Hevy now" type="button">
          <IconRefresh size={16} />
        </button>
      ) : (
        <button className="btn btn--ghost btn--sm" onClick={() => openPage({ kind: 'hevy' })} type="button">
          Connect <IconChevron size={14} />
        </button>
      )}
    </div>
  );
}

export function HevyPage() {
  const w = useWorkouts();
  const { hevy, hevyBusy, hevyError } = w;
  const [key, setKey] = useState('');
  const [result, setResult] = useState<HevySyncResult | null>(null);
  const [confirm, setConfirm] = useState(false);
  const importedCount = Object.keys(hevy.imported).length;
  const exportedCount = Object.keys(hevy.exported).length;

  return (
    <div className="wk">
      <BackBar title="Train" onBack={() => w.openPage(null)} />
      <header className="hevy-head">
        <HevyMark size={52} />
        <div>
          <h1 className="screen__title">Hevy sync</h1>
          <p className="screen__sub">Bring your Hevy history into FITBITRACK and send new workouts back.</p>
        </div>
      </header>

      <HevyCsvImport />

      {!hevy.connected ? (
        <>
          <section className="card">
            <div className="eyebrow">Live sync · needs Hevy Pro</div>
            <ol className="hevy-steps">
              <li>
                In Hevy open <b>Settings → Developer</b> (hevy.com/settings?developer) and create an API key. Hevy only offers API keys with <b>Hevy Pro</b>.
              </li>
              <li>Paste the key below. FITBITRACK stores it encrypted on its server, never in this browser.</li>
              <li>Your Hevy workouts are imported into History, PRs and analytics. Exercises are matched by name; anything new becomes a custom exercise.</li>
              <li>Workouts you finish in FITBITRACK after connecting are sent to Hevy automatically (you can turn this off).</li>
            </ol>
          </section>
          <form
            className="card hevy-form"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!key.trim()) return;
              const ok = await w.connectHevy(key);
              if (ok) setKey('');
            }}
          >
            <label className="field">
              <span className="eyebrow">Hevy API key</span>
              <input id="hevy-key" className="input" type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
            </label>
            <button className="btn btn--primary btn--block" type="submit" disabled={!key.trim() || hevyBusy}>
              {hevyBusy ? 'Connecting…' : 'Connect Hevy'}
            </button>
            {hevyError && <div className="notice">{hevyError}</div>}
          </form>
        </>
      ) : (
        <>
          <section className="card">
            <div className="row-between">
              <div className="eyebrow">Connected{hevy.username ? ` as @${hevy.username}` : ''}</div>
              <span className="status status--on">● Live</span>
            </div>
            <div className="statgrid statgrid--3">
              <div className="stat">
                <span className="stat__label">Last sync</span>
                <span className="stat__value">
                  <b className="num">{ago(hevy.lastSync)}</b>
                </span>
              </div>
              <div className="stat">
                <span className="stat__label">Imported</span>
                <span className="stat__value">
                  <b className="num">{importedCount}</b>
                  <span>workouts</span>
                </span>
              </div>
              <div className="stat">
                <span className="stat__label">Sent to Hevy</span>
                <span className="stat__value">
                  <b className="num">{exportedCount}</b>
                  <span>workouts</span>
                </span>
              </div>
            </div>
            <button
              className="btn btn--primary btn--block hevy-sync"
              onClick={async () => setResult(await w.syncHevy())}
              disabled={hevyBusy}
              type="button"
            >
              <IconRefresh size={16} /> {hevyBusy ? 'Syncing…' : 'Sync now'}
            </button>
            {result && (
              <p className="fine">
                {result.imported} imported · {result.removed} removed · {result.exported} sent to Hevy
                {result.skippedExercises.length ? `. Not in Hevy's library, so skipped on export: ${result.skippedExercises.join(', ')}.` : '.'}
              </p>
            )}
            {hevyError && <div className="notice">{hevyError}</div>}
          </section>

          <section className="card">
            <div className="prow">
              <span className="prow__label">Send new FITBITRACK workouts to Hevy</span>
              <button id="hevy-auto" role="switch" aria-checked={hevy.autoExport} aria-label="Send new workouts to Hevy" className={`toggle ${hevy.autoExport ? 'is-on' : ''}`} onClick={() => w.setHevyAutoExport(!hevy.autoExport)} type="button">
                <span />
              </button>
            </div>
            <p className="fine">Imported Hevy workouts keep their original date and duration. Editing them in Hevy updates them here on the next sync; deleting them in Hevy removes them here.</p>
          </section>

          {confirm ? (
            <div className="confirm">
              <p>Disconnect Hevy? Imported workouts stay in your history; syncing stops and the stored key is deleted.</p>
              <div className="confirm__row">
                <button className="btn btn--ghost" onClick={() => setConfirm(false)} type="button">
                  Cancel
                </button>
                <button
                  className="btn btn--danger"
                  onClick={async () => {
                    await w.disconnectHevy();
                    setConfirm(false);
                  }}
                  type="button"
                >
                  Disconnect
                </button>
              </div>
            </div>
          ) : (
            <button className="btn btn--ghost btn--block btn--dangertext" onClick={() => setConfirm(true)} type="button">
              Disconnect Hevy
            </button>
          )}
        </>
      )}
    </div>
  );
}

/** Free path for everyone: upload the CSV from Hevy → Settings → Export & Import Data → Export Workouts. */
function HevyCsvImport() {
  const w = useWorkouts();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = w.importHevyCsv(await f.text());
      setMsg({ ok: true, text: `${r.added} workouts imported${r.updated ? `, ${r.updated} updated` : ''}${r.newExercises ? ` · ${r.newExercises} new exercises added` : ''}${r.routines ? ` · ${r.routines} routines ready in Routines` : ''}.` });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Couldn't read that file." });
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="card hevy-csv">
      <div className="eyebrow">Import from Hevy · free</div>
      <ol className="hevy-steps">
        <li>
          In Hevy open <b>Profile → Settings → Export &amp; Import Data → Export Workouts</b>. You get a <b>.csv</b> file.
        </li>
        <li>Choose that file here. Workouts, sets, weights and PRs go to History, and your repeated workouts (Push, Pull…) become Routines. Importing again later only adds what's new.</li>
      </ol>
      <label className={`btn btn--primary btn--block ${busy ? 'is-busy' : ''}`}>
        {busy ? 'Importing…' : 'Choose Hevy CSV file'}
        <input type="file" accept=".csv,text/csv" hidden onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
      </label>
      {msg && <div className={msg.ok ? 'fine hevy-csv__ok' : 'notice'}>{msg.text}</div>}
    </section>
  );
}
