# FITBITRACK en Vercel (gratis, actualizaciones sin límite)

La app es la misma: el código sigue en GitHub (`Rodcarrillo/fitbittrack`). Vercel la publica sola cada vez que hay cambios.

## 1. Crear el proyecto
1. Entra a <https://vercel.com/signup> → **Continue with GitHub** (plan **Hobby**, gratis).
2. **Add New… → Project** → elige `fitbittrack` → **Import**.
3. No cambies nada (Vercel lee `vercel.json`). Dale **Deploy**. El primer deploy puede marcar error porque faltan las claves: es normal.

## 2. Base de datos (gratis)
1. En el proyecto: **Storage → Create Database → Upstash for Redis** (Marketplace) → plan **Free** → **Create**.
2. **Connect** al proyecto `fittbittrack` (todas las opciones marcadas). Esto agrega solas `KV_REST_API_URL` y `KV_REST_API_TOKEN`.

## 3. Claves
**Settings → Environment Variables**, agrega (para Production, Preview y Development):

| Nombre | Valor |
|---|---|
| `SECRET_KEY` | el mismo que tenías en Netlify (o uno nuevo largo) |
| `ENCRYPTION_KEY` | el mismo que en Netlify (o uno nuevo largo) |
| `GOOGLE_CLIENT_ID` | tu ID de Google (`55591178803-…apps.googleusercontent.com`) |
| `GOOGLE_CLIENT_SECRET` | tu secreto `GOCSPX-…` |
| `GEMINI_API_KEY` | tu clave de Gemini |

Luego **Deployments → … del último → Redeploy**.

## 4. Google Cloud
Credenciales → tu cliente OAuth:
- **Orígenes de JavaScript**: `https://TU-PROYECTO.vercel.app`
- **URI de redireccionamiento**: `https://TU-PROYECTO.vercel.app/auth/google/callback`
- En **Información de la marca → Dominios autorizados**: `TU-PROYECTO.vercel.app`

Comprueba en `https://TU-PROYECTO.vercel.app/auth/check`.

## 5. En la app
Crea tu cuenta, conecta Google Health, sube el CSV de Hevy y vuelve a copiar el script de widgets (Profile → Widgets). Agrega la nueva dirección a la pantalla de inicio.
