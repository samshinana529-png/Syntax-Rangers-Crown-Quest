from pathlib import Path
import re
html = Path('index.html').read_text(encoding='utf-8')
arm = 'path-p3'
m = re.search(rf'<div class="board-arm arm-[^\"]+ {arm}">(.*?)</div>', html, re.S)
if not m:
    raise SystemExit('missing arm')
tiles = re.findall(r'<div class="tile [^>]+>(.*?)</div>', m.group(1))
for i,t in enumerate(tiles):
    print(i, repr(t.strip()))
path = [3,2,1,0,4,5,6,7,11,10,9,8,12,13,14,15]
print('expected:')
for i,t in enumerate(path[:-1]):
    n = path[i+1]
    r,c = divmod(t,4)
    nr,nc = divmod(n,4)
    if nr==r and nc==c+1: exp='→'
    elif nr==r and nc==c-1: exp='←'
    elif nc==c and nr==r+1: exp='↓'
    elif nc==c and nr==r-1: exp='↑'
    else: exp='?'
    print(t, exp)
