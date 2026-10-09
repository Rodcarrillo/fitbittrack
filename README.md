# FITBITRACK

*Your Fitbit data. Reimagined.*

App web responsiva (iPhone primero, iPad y escritorio) que convierte los datos de tu Fitbit en tres puntajes propios —**Readiness, Sleep y Training Load**— más insights, coach y diario.

## Arrancar

```bash
npm install
npm run dev        # http://localhost:5173 con datos de ejemplo
npm run build      # dist/index.html (un solo archivo)
```

## De dónde salen los datos

| Opción | Veredicto |
|---|---|
| **Google Health API** (sucesora de la Fitbit Web API) | ✅ **La recomendada.** OAuth oficial de Google, datos ya conciliados igual que en la app de Fitbit, sueño con fases, HRV, FC en reposo, SpO₂, temperatura, ejercicios con zonas. |
| Fitbit Web API (legacy) | ❌ Google la apagó en septiembre de 2026. |
| Directo del dispositivo (Bluetooth) | ❌ El protocolo de Fitbit es propietario y cifrado; no hay SDK público. Además el reloj solo se empareja con una app a la vez. |
| Health Connect (Android, en el teléfono) | ⚠️ Útil como segunda fuente si algún día haces app nativa Android; no sirve para web ni iPhone. |

## Arquitectura

```
Provider (MockProvider | GoogleHealthProvider)      src/data/providers
   ↓ mapeo a tipos del dominio                       src/data/providers/googleHealthMappers.ts
Domain model                                         src/domain/types.ts
   ↓
Cálculos (baseline personal, scores)                 src/calc
   ↓
Insights engine + Coach + correlaciones del diario   src/insights
   ↓
UI (componentes + pantallas)                         src/ui
```

- La UI nunca habla con Google. Solo consume `HealthDataset`.
- Cambiar de datos de ejemplo a reales = `VITE_DATA_PROVIDER=google`.
- Datos faltantes o sin permiso → `null` (nunca 0) y la UI muestra “Not available”; los scores se re-ponderan.

## Conectar Google Health (datos reales)

1. Google Cloud Console → crea proyecto → habilita **Google Health API**.
2. Pantalla de consentimiento OAuth + cliente OAuth tipo *Web*. Redirect URI: `https://TU-API/auth/google/callback`.
3. `cp server/.env.example server/.env` y llena las variables (`openssl rand -base64 32` para la llave de cifrado).
4. `npm run server` (backend sin dependencias, Node 20+).
5. `VITE_DATA_PROVIDER=google VITE_API_BASE=https://TU-API npm run build`.

Scopes solicitados (solo lectura): `googlehealth.sleep.readonly`, `googlehealth.health_metrics_and_measurements.readonly`, `googlehealth.activity_and_fitness.readonly`, `googlehealth.profile.readonly`.

> Los nombres de campos de los endpoints diarios (`daily-resting-heart-rate`, `daily-heart-rate-variability`, etc.) están centralizados en `DAILY_TYPES` y los mappers. Confírmalos contra una respuesta real la primera vez; nada más del código necesita cambiar.

## Privacidad

- OAuth 2.0 con PKCE + `state`; el secreto vive solo en el servidor.
- Refresh/access tokens cifrados AES-256-GCM en el servidor; el navegador solo tiene una cookie `httpOnly; Secure; SameSite`.
- Proxy con lista blanca de tipos de dato y solo lectura.
- Los logs registran ruta y error, nunca valores de salud.
- Ningún secreto en el frontend.

## Cómo se calculan los puntajes (FITBITRACK scores, no oficiales de Fitbit)

- **Readiness**: HRV 35 %, FC en reposo 20 %, Sueño 30 %, Carga reciente 15 % (ratio carga 7 d / 28 d). Cada factor se mide en z-score contra tu propio baseline de 30 días (sin incluir hoy); antes de 14 noches usa valores poblacionales.
- **Sleep**: duración vs necesidad (meta + deuda de sueño + carga del día anterior) 50 %, fases 20 %, eficiencia 15 %, consistencia de hora de dormir 15 %.
- **Training Load**: minutos en cada zona de FC ponderados 1–5 (TRIMP), escalado 0–100 con saturación.

## Siguientes pasos sugeridos

- Persistir diario y perfil en base de datos (hoy el diario se guarda en el navegador).
- `RemoteCoach`: endpoint `/api/coach` que llame a un LLM con el resumen `coachFacts()`.
- Envolver en Capacitor para App Store / Play Store.
