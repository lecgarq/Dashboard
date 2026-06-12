#!/usr/bin/env python3
"""
Real-time progress dashboard for the accds activity crawler.

Polls the local Postgres `AccActivityAccds` table and serves an auto-refreshing
web page so you can watch a crawl fill in real time (total rows, insert rate,
projects, service-group + top-project breakdown, live growth chart).

Read-only. Safe to run anytime — it never writes.

Run:  python scripts/accds_progress_ui.py
Then open:  http://localhost:4322
"""
import os
import json
from datetime import datetime, timezone

from dotenv import load_dotenv
import psycopg
from flask import Flask, Response

load_dotenv()  # reads .env in the repo root

DB_URL = (os.environ.get("DIRECT_URL") or os.environ.get("DATABASE_URL") or "").strip()
PORT = int(os.environ.get("ACCDS_UI_PORT", "4322"))

app = Flask(__name__)

# Target = all admin-accessible projects (distinct projectIds the crawler reaches,
# i.e. those present in AccActivity). Static during a sweep, so compute once + cache.
_target_cache = {"n": None}


def target_projects(cur):
    if _target_cache["n"] is None:
        cur.execute('SELECT count(DISTINCT "projectId") FROM "AccActivity" WHERE "projectId" IS NOT NULL')
        _target_cache["n"] = cur.fetchone()[0]
    return _target_cache["n"]


def fetch_stats():
    with psycopg.connect(DB_URL, connect_timeout=5) as conn:
        with conn.cursor() as cur:
            cur.execute('SELECT count(*) FROM "AccActivityAccds"')
            total = cur.fetchone()[0]

            cur.execute('SELECT count(DISTINCT "projectId") FROM "AccActivityAccds"')
            projects = cur.fetchone()[0]
            target = target_projects(cur)

            # rows inserted in the last 10s -> live rate
            cur.execute(
                'SELECT count(*) FROM "AccActivityAccds" '
                "WHERE \"fetchedAt\" > now() - interval '10 seconds'"
            )
            last10 = cur.fetchone()[0]

            # most recent run (by insert time) + its size and activity window
            cur.execute(
                'SELECT "ingestRunId", count(*), min("createdAt"), max("createdAt") '
                'FROM "AccActivityAccds" GROUP BY "ingestRunId" '
                'ORDER BY max("fetchedAt") DESC LIMIT 1'
            )
            run = cur.fetchone()
            run_info = None
            if run:
                run_info = {
                    "id": run[0],
                    "rows": run[1],
                    "from": run[2].isoformat() if run[2] else None,
                    "to": run[3].isoformat() if run[3] else None,
                }

            # service-group breakdown
            cur.execute(
                'SELECT COALESCE("serviceGroup", \'(none)\'), count(*) '
                'FROM "AccActivityAccds" GROUP BY 1 ORDER BY 2 DESC'
            )
            services = [{"name": r[0], "rows": r[1]} for r in cur.fetchall()]

            # all projects by row count (highest first)
            cur.execute(
                'SELECT "projectId", count(*) n FROM "AccActivityAccds" '
                'GROUP BY "projectId" ORDER BY n DESC'
            )
            tops = cur.fetchall()
            ids = [t[0] for t in tops]
            names = {}
            if ids:
                cur.execute('SELECT id, name FROM "AccProject" WHERE id = ANY(%s)', (ids,))
                for r in cur.fetchall():
                    names[r[0]] = r[1]
                cur.execute('SELECT id, name FROM "AccDcProject" WHERE id = ANY(%s)', (ids,))
                for r in cur.fetchall():
                    names.setdefault(r[0], r[1])
            top_projects = [
                {"id": t[0], "name": names.get(t[0]) or t[0], "rows": t[1]} for t in tops
            ]

    return {
        "ok": True,
        "ts": datetime.now(timezone.utc).isoformat(),
        "total": total,
        "projects": projects,
        "targetProjects": target,
        "ratePerSec": round(last10 / 10.0, 1),
        "run": run_info,
        "services": services,
        "topProjects": top_projects,
    }


@app.route("/api/stats")
def api_stats():
    try:
        return Response(json.dumps(fetch_stats()), mimetype="application/json")
    except Exception as e:  # surface DB errors in the UI instead of a blank page
        return Response(
            json.dumps({"ok": False, "error": str(e)}), mimetype="application/json", status=500
        )


@app.route("/")
def index():
    return Response(PAGE, mimetype="text/html")


PAGE = r"""<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><title>accds crawl monitor</title>
<style>
  :root { --bg:#09090b; --panel:#18181b; --line:#27272a; --fg:#fafafa; --muted:#a1a1aa; --accent:#22d3ee; --accent2:#a3e635; }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--fg); font:14px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; }
  header { padding:16px 24px; border-bottom:1px solid var(--line); display:flex; align-items:baseline; gap:12px; }
  header h1 { font-size:15px; margin:0; letter-spacing:.5px; }
  header .dot { width:9px; height:9px; border-radius:50%; background:var(--accent2); box-shadow:0 0 8px var(--accent2); display:inline-block; }
  header .stale { background:#f59e0b; box-shadow:0 0 8px #f59e0b; }
  header .err { background:#ef4444; box-shadow:0 0 8px #ef4444; }
  .wrap { padding:24px; max-width:1100px; margin:0 auto; }
  .cards { display:grid; grid-template-columns:repeat(4,1fr); gap:14px; margin-bottom:20px; }
  .card { background:var(--panel); border:1px solid var(--line); border-radius:12px; padding:16px 18px; }
  .card .label { color:var(--muted); font-size:11px; text-transform:uppercase; letter-spacing:1px; }
  .card .val { font-size:30px; font-weight:600; margin-top:6px; font-variant-numeric:tabular-nums; }
  .card .val small { font-size:14px; color:var(--muted); font-weight:400; }
  .grid2 { display:grid; grid-template-columns:1.2fr 1fr; gap:14px; }
  .panel { background:var(--panel); border:1px solid var(--line); border-radius:12px; padding:16px 18px; }
  .panel h2 { font-size:12px; text-transform:uppercase; letter-spacing:1px; color:var(--muted); margin:0 0 12px; }
  canvas { width:100%; height:120px; display:block; }
  table { width:100%; border-collapse:collapse; }
  td { padding:5px 4px; border-bottom:1px solid var(--line); }
  td.n { text-align:right; font-variant-numeric:tabular-nums; color:var(--accent); }
  td.name { color:var(--fg); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:340px; }
  .bar { height:8px; background:var(--line); border-radius:4px; overflow:hidden; margin-top:3px; }
  .bar > i { display:block; height:100%; background:var(--accent); }
  .svc { margin-bottom:10px; }
  .svc .top { display:flex; justify-content:space-between; }
  .run { color:var(--muted); font-size:12px; margin-top:14px; word-break:break-all; }
  .err-banner { background:#7f1d1d; color:#fff; padding:10px 14px; border-radius:8px; margin-bottom:16px; display:none; }
</style></head>
<body>
<header><span class="dot" id="dot"></span><h1>ACCDS CRAWL MONITOR</h1><span id="clock" style="color:var(--muted);font-size:12px"></span></header>
<div class="wrap">
  <div class="err-banner" id="err"></div>
  <div class="cards">
    <div class="card"><div class="label">Total activity rows</div><div class="val" id="total">—</div></div>
    <div class="card"><div class="label">Insert rate</div><div class="val" id="rate">—<small> rows/s</small></div></div>
    <div class="card"><div class="label">Projects done</div><div class="val"><span id="projects">—</span><small> / <span id="target">—</span></small></div></div>
    <div class="card"><div class="label">Est. time remaining</div><div class="val" id="eta">—</div></div>
  </div>
  <div class="grid2">
    <div class="panel">
      <h2>Total rows over time</h2>
      <canvas id="chart" width="640" height="120"></canvas>
      <div class="run" id="runinfo"></div>
    </div>
    <div class="panel">
      <h2>By service group</h2>
      <div id="services"></div>
    </div>
  </div>
  <div class="panel" style="margin-top:14px">
    <h2>All projects (<span id="projcount">0</span>)</h2>
    <div style="max-height:460px; overflow-y:auto;"><table><tbody id="tops"></tbody></table></div>
  </div>
</div>
<script>
const nf = new Intl.NumberFormat('en-US');
const samples = []; // {t, total}
function fmt(n){ return n==null ? '—' : nf.format(n); }
function fmtDur(sec){
  if (sec < 60) return Math.round(sec)+'s';
  if (sec < 3600) return Math.floor(sec/60)+'m '+Math.round(sec%60)+'s';
  return Math.floor(sec/3600)+'h '+Math.round((sec%3600)/60)+'m';
}
function etaText(target){
  if (!target || samples.length < 4) return 'calculating…';
  const last = samples[samples.length-1], first = samples[0];
  const dtMin = (last.t - first.t)/60000;
  if (dtMin < 0.5) return 'calculating…';
  const remaining = Math.max(0, target - last.projects);
  if (remaining === 0) return 'complete ✓';
  const dp = last.projects - first.projects;        // projects finished across the window
  if (dp <= 0) return 'large project in flight…';   // no completion in window -> can't estimate yet
  const rate = dp/dtMin;                            // projects per minute
  return '~'+fmtDur((remaining/rate)*60);
}

function drawChart(){
  const c = document.getElementById('chart'), ctx = c.getContext('2d');
  const W = c.width, H = c.height; ctx.clearRect(0,0,W,H);
  if (samples.length < 2) return;
  const xs = samples.map(s=>s.t), ys = samples.map(s=>s.total);
  const x0=xs[0], x1=xs[xs.length-1]||x0+1, y0=Math.min(...ys), y1=Math.max(...ys);
  const sx = t => (x1===x0)?0:((t-x0)/(x1-x0))*(W-8)+4;
  const sy = v => H-6-((y1===y0)?0:((v-y0)/(y1-y0))*(H-16));
  ctx.strokeStyle='#22d3ee'; ctx.lineWidth=2; ctx.beginPath();
  samples.forEach((s,i)=>{ const X=sx(s.t),Y=sy(s.total); i?ctx.lineTo(X,Y):ctx.moveTo(X,Y); });
  ctx.stroke();
  ctx.globalAlpha=0.12; ctx.lineTo(sx(x1),H); ctx.lineTo(sx(x0),H); ctx.closePath(); ctx.fillStyle='#22d3ee'; ctx.fill(); ctx.globalAlpha=1;
}

async function tick(){
  const dot = document.getElementById('dot'), err = document.getElementById('err');
  document.getElementById('clock').textContent = new Date().toLocaleTimeString();
  try {
    const r = await fetch('/api/stats'); const d = await r.json();
    if (!d.ok) throw new Error(d.error||'error');
    err.style.display='none';
    document.getElementById('total').textContent = fmt(d.total);
    document.getElementById('rate').innerHTML = fmt(d.ratePerSec)+' <small>rows/s</small>';
    document.getElementById('projects').textContent = fmt(d.projects);
    document.getElementById('target').textContent = fmt(d.targetProjects);
    dot.className = 'dot' + (d.ratePerSec>0 ? '' : ' stale');
    if (d.run) document.getElementById('runinfo').textContent =
      'run '+d.run.id+'  ·  window '+(d.run.from||'').slice(0,10)+' → '+(d.run.to||'').slice(0,10);
    // services
    const stotal = d.services.reduce((a,s)=>a+s.rows,0)||1;
    document.getElementById('services').innerHTML = d.services.map(s=>{
      const pct=(100*s.rows/stotal).toFixed(1);
      return '<div class="svc"><div class="top"><span>'+s.name+'</span><span style="color:var(--muted)">'+fmt(s.rows)+' ('+pct+'%)</span></div><div class="bar"><i style="width:'+pct+'%"></i></div></div>';
    }).join('');
    // top projects
    const max = d.topProjects[0]? d.topProjects[0].rows : 1;
    document.getElementById('tops').innerHTML = d.topProjects.map(p=>
      '<tr><td class="name" title="'+p.name.replace(/"/g,'&quot;')+'">'+p.name+'</td>'+
      '<td style="width:40%"><div class="bar"><i style="width:'+(100*p.rows/max)+'%"></i></div></td>'+
      '<td class="n">'+fmt(p.rows)+'</td></tr>').join('');
    document.getElementById('projcount').textContent = d.topProjects.length;
    // chart sample
    samples.push({t: Date.now(), total: d.total, projects: d.projects});
    if (samples.length>180) samples.shift();
    drawChart();
    document.getElementById('eta').textContent = etaText(d.targetProjects);
  } catch(e){
    dot.className='dot err'; err.style.display='block'; err.textContent='⚠ '+e.message;
  }
}
tick(); setInterval(tick, 2000);
</script>
</body></html>"""


if __name__ == "__main__":
    if not DB_URL:
        raise SystemExit("DATABASE_URL / DIRECT_URL not found in .env")
    print(f"accds monitor -> http://localhost:{PORT}  (Ctrl+C to stop)")
    app.run(host="127.0.0.1", port=PORT, debug=False, use_reloader=False)
