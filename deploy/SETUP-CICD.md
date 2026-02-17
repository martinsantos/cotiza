# CI/CD Setup - cotizAR en licitometro.ar

## Requisitos: GitHub Secrets

Ir a: **GitHub repo → Settings → Secrets and variables → Actions**

Crear estos 3 secrets:

| Secret | Valor | Ejemplo |
|--------|-------|---------|
| `DEPLOY_HOST` | IP del VPS | `76.13.234.213` |
| `DEPLOY_USER` | Usuario SSH | `root` |
| `DEPLOY_SSH_KEY` | Clave privada SSH completa | `-----BEGIN OPENSSH PRIVATE KEY-----...` |

### Cómo obtener la SSH key:

```bash
# En tu máquina local:
cat ~/.ssh/id_rsa
# O si usás ed25519:
cat ~/.ssh/id_ed25519
```

Copiar TODO el contenido (incluyendo las líneas BEGIN/END) al secret `DEPLOY_SSH_KEY`.

### Crear GitHub Environment:

1. GitHub repo → Settings → Environments
2. Crear environment: **production**
3. (Opcional) Agregar "Required reviewers" para aprobar deploys

---

## Flujo CI/CD

```
Push a main/master
    ↓
CI: typecheck → test → build → docker
    ↓ (todo OK)
CD: SSH al server → pull → build → restart cotizar → health check
    ↓ (si falla)
    ROLLBACK automático al commit anterior
```

## Workflows disponibles

### 1. CI (automático)
- Se ejecuta en cada push a `main`, `master`, `claude/**`
- Corre: typecheck, tests, build, docker build

### 2. CD (automático + manual)
- **Automático**: push a `main` o `master`
- **Manual**: Actions → "CD - Deploy" → Run workflow
  - Podés elegir branch
  - Podés skipear CI (emergency deploy)

### 3. Setup (manual, una sola vez)
- Actions → "Setup - First deploy" → Run workflow
- Escribir "setup" para confirmar
- Instala Node.js, crea usuario, servicio systemd, snippet nginx

---

## Seguridad

- **NUNCA toca nginx automáticamente** (solo crea snippet)
- **NUNCA modifica licitometro.ar**
- Solo toca `/opt/cotizar` y el servicio `cotizar`
- Verifica que licitometro sigue vivo antes y después del deploy
- Rollback automático si health check falla
- Concurrency lock: no se pueden ejecutar 2 deploys simultáneos

## Desde el teléfono

1. Abrir GitHub en el browser
2. Ir a **Actions**
3. Seleccionar **"CD - Deploy"**
4. **Run workflow** → elegir branch → Go

## Comandos útiles en el server

```bash
# Ver logs
journalctl -u cotizar -f

# Estado
systemctl status cotizar

# Reiniciar
systemctl restart cotizar

# Health check
curl localhost:3001/health
```
