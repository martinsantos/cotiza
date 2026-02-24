import sys, re

conf_file = sys.argv[1]
# argv[2] can be:
#   - a plain port number → proxy to http://127.0.0.1:{port}
#   - "host:port"         → proxy to http://host:port   (Docker mode)
#   - "host:port/path"    → proxy to http://host:port/path
arg2 = sys.argv[2]
if arg2.isdigit():
    proxy_target = f"http://127.0.0.1:{arg2}"
elif arg2.startswith("http://") or arg2.startswith("https://"):
    proxy_target = arg2.rstrip("/")
else:
    proxy_target = f"http://{arg2}"

BLOCK = (
    "\n    # cotizAR managed block - DO NOT REMOVE"
    "\n    location ^~ /cotizar {"
    f"\n        proxy_pass {proxy_target};"
    "\n        proxy_http_version 1.1;"
    "\n        proxy_set_header Upgrade $http_upgrade;"
    "\n        proxy_set_header Connection 'upgrade';"
    "\n        proxy_set_header Host $host;"
    "\n        proxy_set_header X-Real-IP $remote_addr;"
    "\n        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;"
    "\n        proxy_set_header X-Forwarded-Proto $scheme;"
    "\n        proxy_read_timeout 120s;"
    "\n        proxy_connect_timeout 5s;"
    "\n        proxy_no_cache 1;"
    "\n        proxy_cache_bypass 1;"
    "\n    }"
)

with open(conf_file) as f:
    content = f.read()


def find_blocks(text):
    blocks = []
    for m in re.finditer(r'\bserver\s*\{', text):
        s = m.start()
        depth = 0
        p = m.end() - 1
        while p < len(text):
            if text[p] == '{':
                depth += 1
            elif text[p] == '}':
                depth -= 1
                if depth == 0:
                    blocks.append((s, p + 1))
                    break
            p += 1
    return blocks


def score(bt):
    s = 0
    if 'root ' in bt or 'root\t' in bt:
        s += 20
    if 'try_files' in bt:
        s += 15
    if re.search(r'location\s+/', bt):
        s += 10
    if re.search(r'listen\s+443', bt):
        s += 5
    if re.search(r'return\s+30\d', bt):
        s -= 30
    return s


blocks = find_blocks(content)
print(f"Found {len(blocks)} server block(s)")
if not blocks:
    content += BLOCK + '\n'
    print("Appended (no server blocks found)")
else:
    scored = sorted([(score(content[s:e]), s, e) for s, e in blocks], reverse=True)
    for sc, s, e in scored:
        print(f"  score={sc}: {content[s:s+50].strip()!r}")

    # Inject into ALL non-redirect server blocks (score > 0) that don't already have the block.
    # Work from highest offset to lowest so earlier insertions don't shift later positions.
    targets = [(sc, s, e) for sc, s, e in scored if sc > 0]
    if not targets:
        # All blocks are redirects; fall back to top scorer
        targets = [scored[0]]
        print("All blocks are redirects — injecting into top scorer anyway")

    injected = 0
    for sc, bs, be in sorted(targets, key=lambda x: x[1], reverse=True):
        bt = content[bs:be]
        if 'cotizAR managed block' in bt:
            print(f"  skip (already has block): {content[bs:bs+50].strip()!r}")
            continue
        ins = None
        for pat in [r'\n[ \t]*location\s+/\s*\{', r'\n[ \t]*location\s+~', r'\n[ \t]*error_page\b']:
            m = re.search(pat, bt)
            if m:
                ins = bs + m.start()
                print(f"  inserting before: {bt[m.start():m.start()+40].strip()!r}")
                break
        if ins is None:
            ins = be - 1
            print(f"  inserting before closing }}")
        content = content[:ins] + BLOCK + content[ins:]
        injected += 1

    print(f"Injected into {injected} server block(s)")

with open(conf_file, 'w') as f:
    f.write(content)
print(f"Done: {conf_file}")
