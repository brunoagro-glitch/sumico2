# Gera animado.html a partir do index.html, acrescentando a camada de movimento (anim.css e anim.js).
# Rode depois de mudar o index.html:  python3 build-animado.py
s = open('index.html', encoding='utf8').read()
i = s.index('\n</style>\n') + len('\n</style>\n')
s = s[:i] + '<meta name="robots" content="noindex, nofollow">\n<link rel="stylesheet" href="anim.css">\n' + s[i:]
s = s.rstrip('\n') + '\n<script src="anim.js" defer></script>\n'
open('animado.html', 'w', encoding='utf8').write(s)
print('animado.html atualizado')
