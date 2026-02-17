# CI/CD - cotizAR en licitometro.ar

## Requisitos: 3 Secrets en GitHub

**Repo → Settings → Secrets and variables → Actions**

| Secret | Valor | Ejemplo |
|--------|-------|---------|
| `DEPLOY_HOST` | IP del VPS | `203.0.113.10` |
| `DEPLOY_USER` | Usuario SSH | `root` |
| `DEPLOY_SSH_KEY` | Clave privada SSH **completa** | `-----BEGIN OPENSSH PRIVATE KEY-----...` |

### Cómo obtener la SSH key:

```bash
cat ~/.ssh/id_rsa
# o
cat ~/.ssh/id_ed25519
```

Copiar **TODO** (incluyendo BEGIN/END) al secret `DEPLOY_SSH_KEY`.

### Environment de GitHub:

1. Settings → Environments → New environment → **production**
2. (Opcional) agregar reviewers para aprobar deploys

---

## Flujo completo

```
Push a cualquier branch (main, claude/**)
    ↓
CI: typecheck → test → build → docker
    ↓ (todo OK)
CD: SSH al server →
    instala Node.js si falta →
    instala build tools →
    clone/pull código →
    npm ci + build →
    crea usuario + systemd →
    restart servicio →
    health check →
    configura nginx (auto, seguro) →
    smoke test público
    ↓ (si falla health check)
    ROLLBACK automático al commit anterior
```

## Qué hace el CD automáticamente

1. Instala Node.js 20 si no existe o es viejo
2. Instala python3/make/g++ para better-sqlite3
3. Clona o actualiza el código
4. `npm ci` + `npm run build`
5. Crea usuario `cotizar` (no root)
6. Crea/actualiza servicio systemd
7. **Configura nginx automáticamente** (con backup y rollback si falla)
8. Verifica que licitometro.ar sigue vivo post-deploy
9. Smoke test desde afuera a la URL pública

## Desde el teléfono

1. GitHub → **Actions**
2. **"CD - Deploy to licitometro.ar"**
3. **Run workflow** → elegir branch → Go

## Comandos útiles en el server

```bash
journalctl -u cotizar -f        # Logs en vivo
systemctl status cotizar         # Estado
systemctl restart cotizar        # Reiniciar
curl localhost:3001/health       # Health check
```
