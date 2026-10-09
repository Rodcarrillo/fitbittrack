# FITBITRACK en Netlify (con Google Health y Hevy funcionando)

## Por qué te salía "tienes que hacer algo"

Arrastrar la carpeta a Netlify Drop sube **solo la app**. Para conectar Google Health y Hevy hace falta el **servidor** (`netlify/functions/api.mjs`), que guarda tu usuario, tus entrenamientos y tus conexiones cifradas en **Netlify Blobs**. Netlify Drop no sube servidores; para eso Netlify tiene que **construir el proyecto desde GitHub**. Son 10 minutos y solo se hace una vez.

---

## 1. Subir el proyecto a GitHub (desde el navegador)

1. Entra a <https://github.com> (crea cuenta si no tienes).
2. Arriba a la derecha **+ → New repository**. Nombre: `fitbitrack`. Márcalo **Private**. **Create repository**.
3. En la página del repositorio vacío, haz clic en **uploading an existing file**.
4. Descomprime `fitbitrack-netlify-proyecto.zip` en tu computadora, abre la carpeta `fitbitrack` y **arrastra todo su contenido** (las carpetas `src`, `netlify`, `public`, `scripts` y los archivos `package.json`, `netlify.toml`, etc.) a la página de GitHub.
5. Abajo, **Commit changes**.

## 2. Conectar GitHub con Netlify

1. En <https://app.netlify.com>: **Add new site → Import an existing project → GitHub**.
2. Autoriza a Netlify y elige el repositorio `fitbitrack`.
3. Netlify lee `netlify.toml` y llena todo solo (build: `npm run build`, publish: `dist`). Dale **Deploy**.

> ¿Ya tenías un sitio en Netlify con el nombre que te gusta? Puedes borrarlo y ponerle ese nombre a este nuevo en **Site configuration → Change site name**.

## 3. Poner tus claves secretas

En tu sitio: **Site configuration → Environment variables → Add a variable**. Agrega estas cuatro:

| Nombre | Valor |
|---|---|
| `SECRET_KEY` | Un texto aleatorio largo (40+ caracteres). Puedes usar cualquier generador de contraseñas. |
| `ENCRYPTION_KEY` | Otro texto aleatorio largo, distinto al anterior. |
| `GOOGLE_CLIENT_ID` | Del paso 4. |
| `GOOGLE_CLIENT_SECRET` | Del paso 4. |

Después: **Deploys → Trigger deploy → Deploy site** para que tome las claves.

**No cambies `ENCRYPTION_KEY` después:** si la cambias, hay que volver a conectar Google y Hevy. (Tus cuentas y entrenamientos no se pierden.)

## 4. Google Health (tus datos reales del Fitbit)

1. <https://console.cloud.google.com> → crea un proyecto "FITBITRACK".
2. **APIs y servicios → Biblioteca** → **Google Health API** → **Habilitar**.
3. **Pantalla de consentimiento de OAuth**: tipo **Externo**, nombre FITBITRACK, tu correo. Agrega los permisos:
   - `.../auth/googlehealth.sleep.readonly`
   - `.../auth/googlehealth.health_metrics_and_measurements.readonly`
   - `.../auth/googlehealth.activity_and_fitness.readonly`
   - `.../auth/googlehealth.profile.readonly`

   En **Usuarios de prueba** agrega tu cuenta de Google (la de tu Fitbit).
4. **Credenciales → Crear credenciales → ID de cliente de OAuth → Aplicación web**.
   - *URI de redireccionamiento autorizado*: `https://TU-SITIO.netlify.app/auth/google/callback`
5. Copia el ID y el secreto a las variables del paso 3 y vuelve a hacer **Trigger deploy**.
6. Abre tu app, crea tu cuenta y toca **Connect Google Health**.

> Si acabas de habilitar la API, Google puede tardar unos minutos. Si sale un error, espera 5 minutos y vuelve a intentar.

## 5. Hevy

En la app: **Train → tarjeta Hevy → Connect**, y pega tu clave de API. Hevy solo da claves con **Hevy Pro** (Hevy → Settings → Developer). En Netlify no hay que pedir permisos extra.

## 6. Instalarla en el celular

Abre `https://TU-SITIO.netlify.app`:
- **iPhone (Safari):** Compartir → **Agregar a pantalla de inicio**.
- **Android (Chrome):** menú ⋮ → **Instalar app**.

## 7. Actualizar más adelante

Sube los archivos nuevos a GitHub (arrastrándolos igual que en el paso 1). Netlify se actualiza solo en uno o dos minutos y tus cuentas y datos se quedan.

---

### Qué guarda el servidor

| Qué | Cómo |
|---|---|
| Usuario y contraseña | La contraseña nunca se guarda, solo un hash scrypt |
| Conexión con Google y clave de Hevy | Cifradas con AES-256 usando tu `ENCRYPTION_KEY` |
| Entrenamientos y diario | Por usuario en Netlify Blobs; se sincronizan entre tus dispositivos |
| Datos de salud del Fitbit | No se guardan; se piden a Google cada vez que abres la app |
