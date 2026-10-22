import { MAPS, WALL, WATER, FLOOR } from '../src/maps.js';
import { BRAWLERS } from '../src/config.js';
let ok = true;
for (const m of MAPS) {
  console.log(`\n=== ${m.id} ${m.name} (${m.width}x${m.height}) ===`);
  for (const row of m.grid) console.log(row.map(t => ['.','#','=','~','*'][t] ?? '.').join(''));
  console.log('spawns', m.spawns[0].length, m.spawns[1].length, 'goals', !!m.goals[0], !!m.goals[1], 'crates', m.crateCount);
  if (m.spawns[0].length !== 3 || m.spawns[1].length !== 3) { console.log('!! spawns != 3'); ok = false; }
  for (const team of [0,1]) for (const s of m.spawns[team]) {
    const tx = Math.floor(s.x/80), ty = Math.floor(s.y/80);
    if (m.grid[ty][tx] !== FLOOR) { console.log('!! spawn blocked', team, tx, ty); ok = false; }
  }
  // симметрия
  for (let y=0;y<m.height;y++) for (let x=0;x<m.width;x++) {
    const a = m.grid[y][x], b = m.grid[y][m.width-1-x];
    if (a !== b) { console.log('!! asym at', x, y, a, b); ok = false; }
  }
  // доступность центра от спавна (BFS)
  const CH = ['.','#','=','~','*'];
  const seen = new Set();
  const q = [[Math.floor(m.spawns[0][0].x/80), Math.floor(m.spawns[0][0].y/80)]];
  while (q.length) {
    const [x,y] = q.pop(); const k = y*m.width+x;
    if (seen.has(k)) continue; seen.add(k);
    for (const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const nx=x+dx, ny=y+dy;
      if (nx<0||ny<0||nx>=m.width||ny>=m.height) continue;
      const t=m.grid[ny][nx];
      if (t===WALL||t===WATER) continue;
      const nk=ny*m.width+nx; if (!seen.has(nk)) q.push([nx,ny]);
    }
  }
  const cx=Math.floor(m.width/2), cy=Math.floor(m.height/2);
  if (!seen.has(cy*m.width+cx)) { console.log('!! center unreachable'); ok = false; }
  if (m.goals[0] && !seen.has(Math.floor(m.goals[1].y/80+1)*m.width + Math.floor((m.goals[1].x+m.goals[1].w/2)/80))) {
    console.log('!! enemy goal unreachable'); ok = false;
  }
  console.log('reachable tiles', seen.size, '/', m.width*m.height);
}
console.log('\nBrawlers:', BRAWLERS.length);
console.log(ok ? '\nMAPS OK' : '\nMAPS FAIL');
process.exit(ok?0:1);
