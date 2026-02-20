#!/usr/bin/env python3
"""
ssh_web.py — Cliente SSH por navegador (Android/PC)
Uso: python3 ssh_web.py [--port 8022] [--host 0.0.0.0]

Instalar dependencias:
    pip install flask flask-socketio paramiko eventlet
"""

import argparse
import threading
import select
import sys

import paramiko
import eventlet
eventlet.monkey_patch()

from flask import Flask, render_template_string
from flask_socketio import SocketIO, emit, disconnect

# ─────────────────────────────── Flask app ────────────────────────────────── #

app = Flask(__name__)
app.config["SECRET_KEY"] = "ssh-web-secret"
socketio = SocketIO(app, cors_allowed_origins="*", async_mode="eventlet")

# sid → {"client": paramiko.SSHClient, "channel": paramiko.Channel, "thread": Thread}
sessions: dict = {}

# ──────────────────────────────── HTML/JS ─────────────────────────────────── #

HTML = r"""
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no">
<title>SSH Web</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/xterm@5.3.0/css/xterm.min.css">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #0d0d0d; color: #e0e0e0; font-family: monospace;
         display: flex; flex-direction: column; height: 100dvh; }

  #login { display: flex; flex-direction: column; align-items: center;
           justify-content: center; flex: 1; padding: 24px; gap: 12px; }
  #login h1 { font-size: 1.3rem; color: #7ec8e3; margin-bottom: 8px; }
  #login input, #login select {
    width: 100%; max-width: 340px; padding: 10px 14px;
    background: #1a1a2e; border: 1px solid #333; border-radius: 8px;
    color: #e0e0e0; font-size: 1rem; }
  #login input:focus { outline: none; border-color: #7ec8e3; }
  #login button {
    width: 100%; max-width: 340px; padding: 12px;
    background: #7ec8e3; color: #0d0d0d; border: none;
    border-radius: 8px; font-size: 1rem; font-weight: bold; cursor: pointer; }
  #login button:active { opacity: 0.8; }
  #status { font-size: 0.85rem; color: #f4a261; min-height: 20px; }
  #auth-type { display: flex; gap: 12px; width: 100%; max-width: 340px; }
  #auth-type label { display: flex; align-items: center; gap: 6px;
                     cursor: pointer; font-size: 0.9rem; }
  #pkey-area { width: 100%; max-width: 340px; }
  #pkey-area textarea {
    width: 100%; height: 120px; background: #1a1a2e; border: 1px solid #333;
    border-radius: 8px; color: #e0e0e0; font-size: 0.75rem; padding: 8px;
    resize: vertical; }

  #terminal-wrap { display: none; flex-direction: column; flex: 1; overflow: hidden; }
  #topbar { background: #111; padding: 8px 16px; display: flex;
            justify-content: space-between; align-items: center;
            border-bottom: 1px solid #222; font-size: 0.85rem; color: #aaa; }
  #topbar span { color: #7ec8e3; }
  #disconnect-btn {
    background: #c0392b; color: #fff; border: none;
    border-radius: 6px; padding: 4px 12px; cursor: pointer; font-size: 0.8rem; }
  #xterm-container { flex: 1; padding: 4px; overflow: hidden; }

  /* soft keyboard helper */
  #kbd-helper { display: none; background: #111; padding: 6px 8px;
                overflow-x: auto; white-space: nowrap;
                border-top: 1px solid #222; }
  #kbd-helper button {
    background: #1a1a2e; color: #e0e0e0; border: 1px solid #333;
    border-radius: 6px; padding: 6px 10px; margin-right: 6px;
    font-size: 0.8rem; cursor: pointer; }
  #kbd-helper button:active { background: #7ec8e3; color: #0d0d0d; }
</style>
</head>
<body>

<!-- ── Login ── -->
<div id="login">
  <h1>🔒 SSH Web</h1>

  <input id="host"     type="text"     placeholder="Host / IP"        value="" autocomplete="off" autocorrect="off" spellcheck="false">
  <input id="port"     type="number"   placeholder="Puerto (22)"      value="22">
  <input id="user"     type="text"     placeholder="Usuario"          autocomplete="off" autocorrect="off" spellcheck="false">

  <div id="auth-type">
    <label><input type="radio" name="auth" value="password" checked> Contraseña</label>
    <label><input type="radio" name="auth" value="key"> Clave privada</label>
  </div>

  <input id="password" type="password" placeholder="Contraseña">
  <div id="pkey-area" style="display:none">
    <textarea id="pkey" placeholder="Pegá tu clave privada (PEM / OpenSSH)"></textarea>
    <input id="pkey-pass" type="password" placeholder="Passphrase (si tiene)" style="margin-top:8px">
  </div>

  <p id="status"></p>
  <button id="connect-btn" onclick="doConnect()">Conectar</button>
</div>

<!-- ── Terminal ── -->
<div id="terminal-wrap">
  <div id="topbar">
    <span id="conn-label"></span>
    <button id="disconnect-btn" onclick="doDisconnect()">Desconectar</button>
  </div>
  <div id="xterm-container"></div>
  <div id="kbd-helper">
    <button onclick="sendKey('\x01')">Ctrl+A</button>
    <button onclick="sendKey('\x03')">Ctrl+C</button>
    <button onclick="sendKey('\x04')">Ctrl+D</button>
    <button onclick="sendKey('\x1b')">ESC</button>
    <button onclick="sendKey('\t')">TAB</button>
    <button onclick="sendKey('\x7f')">⌫</button>
    <button onclick="sendKey('\x1b[A')">↑</button>
    <button onclick="sendKey('\x1b[B')">↓</button>
    <button onclick="sendKey('\x1b[C')">→</button>
    <button onclick="sendKey('\x1b[D')">←</button>
    <button onclick="sendKey('sudo ')">sudo</button>
    <button onclick="sendKey('exit\n')">exit</button>
  </div>
</div>

<script src="https://cdn.jsdelivr.net/npm/xterm@5.3.0/lib/xterm.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/xterm-addon-fit@0.8.0/lib/xterm-addon-fit.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/socket.io/client-dist/socket.io.min.js"></script>
<script>
let socket, term, fitAddon;

// Auth type toggle
document.querySelectorAll('input[name="auth"]').forEach(r => {
  r.addEventListener('change', () => {
    const isKey = r.value === 'key' && r.checked;
    document.getElementById('password').style.display  = isKey ? 'none' : '';
    document.getElementById('pkey-area').style.display = isKey ? '' : 'none';
  });
});

function status(msg, color) {
  const el = document.getElementById('status');
  el.textContent = msg;
  el.style.color = color || '#f4a261';
}

function doConnect() {
  const host     = document.getElementById('host').value.trim();
  const port     = parseInt(document.getElementById('port').value) || 22;
  const user     = document.getElementById('user').value.trim();
  const authType = document.querySelector('input[name="auth"]:checked').value;
  const password = document.getElementById('password').value;
  const pkey     = document.getElementById('pkey').value.trim();
  const pkeyPass = document.getElementById('pkey-pass').value;

  if (!host || !user) { status('Completá host y usuario.'); return; }
  if (authType === 'password' && !password) { status('Ingresá la contraseña.'); return; }
  if (authType === 'key' && !pkey) { status('Pegá tu clave privada.'); return; }

  status('Conectando…', '#7ec8e3');
  document.getElementById('connect-btn').disabled = true;

  socket = io({ transports: ['websocket'] });

  socket.on('connect', () => {
    socket.emit('ssh_connect', { host, port, user, auth_type: authType,
                                  password, pkey, pkey_passphrase: pkeyPass });
  });

  socket.on('ssh_output', data => { if (term) term.write(data); });

  socket.on('ssh_status', msg => {
    if (msg.ok) {
      showTerminal(user, host, port);
    } else {
      status('Error: ' + msg.error);
      document.getElementById('connect-btn').disabled = false;
      socket.disconnect();
    }
  });

  socket.on('ssh_closed', () => {
    if (term) term.write('\r\n\x1b[33m[Conexión cerrada]\x1b[0m\r\n');
  });

  socket.on('disconnect', () => {
    if (term) term.write('\r\n\x1b[31m[Socket desconectado]\x1b[0m\r\n');
  });
}

function showTerminal(user, host, port) {
  document.getElementById('login').style.display = 'none';
  const wrap = document.getElementById('terminal-wrap');
  wrap.style.display = 'flex';
  document.getElementById('conn-label').textContent = `${user}@${host}:${port}`;

  // show helper bar on touch devices
  if (navigator.maxTouchPoints > 0) {
    document.getElementById('kbd-helper').style.display = 'block';
  }

  term = new Terminal({
    cursorBlink: true,
    fontSize: 14,
    fontFamily: '"Cascadia Code", "Fira Code", monospace',
    theme: {
      background: '#0d0d0d', foreground: '#e0e0e0',
      cursor: '#7ec8e3', selectionBackground: '#7ec8e355',
    }
  });
  fitAddon = new FitAddon.FitAddon();
  term.loadAddon(fitAddon);
  term.open(document.getElementById('xterm-container'));
  fitAddon.fit();

  term.onData(data => socket && socket.emit('ssh_input', data));

  window.addEventListener('resize', () => {
    fitAddon.fit();
    if (socket) socket.emit('ssh_resize', { cols: term.cols, rows: term.rows });
  });

  // initial resize
  setTimeout(() => {
    fitAddon.fit();
    socket.emit('ssh_resize', { cols: term.cols, rows: term.rows });
  }, 100);

  term.focus();
  status('');
}

function doDisconnect() {
  if (socket) socket.disconnect();
  document.getElementById('terminal-wrap').style.display = 'none';
  document.getElementById('login').style.display = 'flex';
  document.getElementById('connect-btn').disabled = false;
  document.getElementById('conn-label').textContent = '';
  status('Desconectado.');
  term = null;
}

function sendKey(seq) {
  if (socket) socket.emit('ssh_input', seq);
}
</script>
</body>
</html>
"""

# ─────────────────────────────── Routes ───────────────────────────────────── #

@app.route("/")
def index():
    return render_template_string(HTML)

# ──────────────────────────── SocketIO events ─────────────────────────────── #

@socketio.on("ssh_connect")
def handle_connect(data):
    sid = data.get("_sid") or threading.current_thread().name  # fallback
    # Use request.sid via flask_socketio context
    from flask import request as freq
    sid = freq.sid

    host      = data.get("host", "")
    port      = int(data.get("port", 22))
    user      = data.get("user", "")
    auth_type = data.get("auth_type", "password")
    password  = data.get("password", "")
    pkey_str  = data.get("pkey", "")
    pkey_pass = data.get("pkey_passphrase", "") or None

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())

    try:
        connect_kwargs = dict(hostname=host, port=port, username=user,
                              timeout=15, banner_timeout=15)
        if auth_type == "key":
            import io as _io
            pkey_file = _io.StringIO(pkey_str)
            # try RSA, then Ed25519, then ECDSA
            pkey = None
            for cls in (paramiko.RSAKey, paramiko.Ed25519Key,
                        paramiko.ECDSAKey, paramiko.DSSKey):
                try:
                    pkey_file.seek(0)
                    pkey = cls.from_private_key(pkey_file, password=pkey_pass)
                    break
                except Exception:
                    continue
            if pkey is None:
                emit("ssh_status", {"ok": False, "error": "No se pudo parsear la clave privada."})
                return
            connect_kwargs["pkey"] = pkey
        else:
            connect_kwargs["password"] = password

        client.connect(**connect_kwargs)
    except paramiko.AuthenticationException:
        emit("ssh_status", {"ok": False, "error": "Autenticación fallida."})
        return
    except Exception as e:
        emit("ssh_status", {"ok": False, "error": str(e)})
        return

    channel = client.invoke_shell(term="xterm-256color", width=220, height=50)
    channel.setblocking(False)

    sessions[sid] = {"client": client, "channel": channel}

    emit("ssh_status", {"ok": True})

    # background reader
    def reader():
        while True:
            try:
                r, _, _ = select.select([channel], [], [], 0.1)
                if r:
                    data = channel.recv(4096)
                    if not data:
                        break
                    socketio.emit("ssh_output", data.decode("utf-8", errors="replace"), room=sid)
                if channel.closed:
                    break
            except Exception:
                break
        socketio.emit("ssh_closed", room=sid)
        _cleanup(sid)

    t = threading.Thread(target=reader, daemon=True)
    t.start()
    sessions[sid]["thread"] = t


@socketio.on("ssh_input")
def handle_input(data):
    from flask import request as freq
    sid = freq.sid
    sess = sessions.get(sid)
    if sess and not sess["channel"].closed:
        try:
            sess["channel"].sendall(data.encode("utf-8") if isinstance(data, str) else data)
        except Exception:
            pass


@socketio.on("ssh_resize")
def handle_resize(data):
    from flask import request as freq
    sid = freq.sid
    sess = sessions.get(sid)
    if sess:
        try:
            cols = int(data.get("cols", 80))
            rows = int(data.get("rows", 24))
            sess["channel"].resize_pty(width=cols, height=rows)
        except Exception:
            pass


@socketio.on("disconnect")
def handle_disconnect():
    from flask import request as freq
    _cleanup(freq.sid)


def _cleanup(sid):
    sess = sessions.pop(sid, None)
    if sess:
        try:
            sess["channel"].close()
        except Exception:
            pass
        try:
            sess["client"].close()
        except Exception:
            pass


# ─────────────────────────────── Main ────────────────────────────────────── #

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="SSH Web Client")
    parser.add_argument("--host", default="0.0.0.0", help="Bind host (default: 0.0.0.0)")
    parser.add_argument("--port", type=int, default=8022, help="HTTP port (default: 8022)")
    args = parser.parse_args()

    print(f"""
╔══════════════════════════════════════╗
║         SSH Web Client               ║
╠══════════════════════════════════════╣
║  URL local:  http://localhost:{args.port:<6}  ║
║  Red local:  http://<tu-IP>:{args.port:<6}   ║
╚══════════════════════════════════════╝

Dependencias:  pip install flask flask-socketio paramiko eventlet
""")
    socketio.run(app, host=args.host, port=args.port, debug=False)
