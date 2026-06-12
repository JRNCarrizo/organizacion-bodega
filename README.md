# Organización Bodega

App de escritorio (Electron + React + SQLite) para gestionar empleados, turnos Stretch y menú de comidas.

## Desarrollo

```bash
npm install
npm run dev
```

## Instalador para otra PC (sin programar)

1. Entrá a [Releases](https://github.com/JRNCarrizo/organizacion-bodega/releases)
2. Descargá el archivo **`Organización Bodega-Setup-X.X.X.exe`** de la última versión
3. Ejecutalo e instalá en la otra computadora

Los datos se guardan en `%APPDATA%\organizacion-bodega\` (base de datos local).

## Actualizar la app instalada

La app busca actualizaciones al iniciar. También podés ir a **Stretch → Configuración → Actualizaciones** y usar **Buscar actualizaciones**.

Si hay una versión nueva:
1. **Descargar**
2. **Instalar y reiniciar**

## Publicar una nueva versión (desde tu PC de desarrollo)

### 1. Subir el código a GitHub (solo la primera vez)

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/JRNCarrizo/organizacion-bodega.git
git push -u origin main
```

### 2. Crear un release (cada versión nueva)

1. Actualizá la versión en `package.json` (ej. `1.0.1`)
2. Commiteá y subí:

```bash
git add package.json
git commit -m "Bump version to 1.0.1"
git push
```

3. Creá y subí el tag (debe coincidir con la versión, con `v` adelante):

```bash
git tag v1.0.1
git push origin v1.0.1
```

GitHub Actions compilará el instalador y lo publicará automáticamente en Releases.

### Alternativa: publicar desde tu PC

Con un [Personal Access Token](https://github.com/settings/tokens) de GitHub con permiso `repo`:

```powershell
$env:GH_TOKEN="tu_token"
npm run build:publish
```

## Scripts útiles

| Comando | Descripción |
|---------|-------------|
| `npm run dev` | Desarrollo con hot reload |
| `npm run build` | Genera instalador en `release/` (sin subir) |
| `npm run build:publish` | Genera instalador y publica en GitHub Releases |
