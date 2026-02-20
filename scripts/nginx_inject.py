import sys, re

conf_file = sys.argv[1]
port = sys.argv[2]

BLOCK = (
    "\n    # cotizAR managed block - DO NOT REMOVE"
    "\n    location ^~ /cotizar {"
    "\n        proxy_pass http://127.0.0.1:" + port + "/cotizar;"
    "\n        proxy_http_version 1.1;"
    "\n        proxy_set_header Host $host;"
    "\n        proxy_set_header X-Real-IP $remote_addr;"
    "\n        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;"
    "\n        proxy_set_header X-Forwarded-Proto $scheme;"
    "\n        proxy_read_timeout 30s;"
    "\n        proxy_connect_timeout 5s;"
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
    print("Appended")
else:
    scored = sorted([(score(content[s:e]), s, e) for s, e in blocks], reverse=True)
    for sc, s, e in scored:
        print(f"  score={sc}: {content[s:s+50].strip()!r}")
    _, bs, be = scored[0]
    bt = content[bs:be]
    ins = None
    for pat in [r'\n[ \t]*location\s+/\s*\{', r'\n[ \t]*location\s+~', r'\n[ \t]*error_page\b']:
        m = re.search(pat, bt)
        if m:
            ins = bs + m.start()
            print(f"Inserting before: {bt[m.start():m.start()+40].strip()!r}")
            break
    if ins is None:
        ins = be - 1
        print("Inserting before closing }")
    content = content[:ins] + BLOCK + content[ins:]

with open(conf_file, 'w') as f:
    f.write(content)
print(f"Done: {conf_file}")
