import re, sys

conf_file = sys.argv[1]
with open(conf_file) as f:
    orig = f.read()

cleaned = re.sub(
    r'[ \t]*# cotizAR managed block[^\n]*\n[ \t]*location\s+\^~\s+/cotizar\s*\{[^}]*\}\n?',
    '', orig, flags=re.DOTALL)
cleaned = re.sub(
    r'[ \t]*location\s+\^~\s+/cotizar\s*\{[^}]*\}\n?',
    '', cleaned, flags=re.DOTALL)

if cleaned != orig:
    with open(conf_file, 'w') as f:
        f.write(cleaned)
    print(f"Stripped: {conf_file}")
else:
    print(f"Clean: {conf_file}")
