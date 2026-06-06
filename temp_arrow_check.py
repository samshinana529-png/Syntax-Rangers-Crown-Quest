from pathlib import Path
import re
html = Path('index.html').read_text(encoding='utf-8')
path_tiles = {
    1: [12, 13, 14, 15, 11, 10, 9, 8, 4, 5, 6, 7, 3, 2, 1, 0],
    2: [15, 11, 7, 3, 2, 6, 10, 14, 13, 9, 5, 1, 0, 4, 8, 12],
    3: [3, 2, 1, 0, 4, 5, 6, 7, 11, 10, 9, 8, 12, 13, 14, 15],
    4: [0, 4, 8, 12, 13, 9, 5, 1, 2, 6, 10, 14, 15, 11, 7, 3]
}
for pid in path_tiles:
    m = re.search(rf'<div class="board-arm arm-[^\"]+ path-p{pid}">(.*?)</div>', html, re.S)
    if not m:
        raise SystemExit(f'missing arm {pid}')
    tiles = re.findall(r'<div class="tile [^>]+>(.*?)</div>', m.group(1))
    print(f'arm {pid} len {len(tiles)}')
    for i,t in enumerate(path_tiles[pid]):
        if i == len(path_tiles[pid]) - 1:
            break
        n = path_tiles[pid][i+1]
        r,c = divmod(t,4)
        nr,nc = divmod(n,4)
        if nr==r and nc==c+1:
            exp='→'
        elif nr==r and nc==c-1:
            exp='←'
        elif nc==c and nr==r+1:
            exp='↓'
        elif nc==c and nr==r-1:
            exp='↑'
        else:
            exp='?'
        curr = tiles[t].strip()
        if curr not in ('P1 START','P2 START','P3 START','P4 START') and curr != exp:
            print('mismatch', pid, t, curr, 'expected', exp)
