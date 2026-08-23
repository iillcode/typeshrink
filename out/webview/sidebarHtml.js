"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.escapeHtml = escapeHtml;
exports.getSidebarHtml = getSidebarHtml;
// ---- Rich sidebar UI (Kilo Code style) ----
function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function getSidebarHtml() {
    return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8">
<style>
  /* ---- Extension palette (see DESIGN.md) ---- */
  :root{
    --vscode-sideBar-background:#1E1F1C;
    --vscode-foreground:#F8F8F2;
    --vscode-panel-border:#34352F;
    --vscode-list-hoverBackground:#3E3D32;
    --vscode-toolbar-hoverBackground:#3E3D32;
    --vscode-badge-background:#75715E;
    --vscode-badge-foreground:#F8F8F2;
    --vscode-button-secondaryBackground:#414339;
    --vscode-button-secondaryForeground:#F8F8F2;
    --vscode-button-secondaryHoverBackground:#75715E;
    --vscode-focusBorder:#75715E;
    --vscode-textCodeBlock-background:#272822;
  }
  body{margin:0;padding:0;font-family:var(--vscode-font-family);font-size:13px;
    color:var(--vscode-foreground);background:var(--vscode-sideBar-background);}
  /* ---- Header ---- */
  #header{display:flex;align-items:center;gap:6px;padding:10px 12px;border-bottom:1px solid var(--vscode-panel-border);}
  #header h2{margin:0;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.4px;flex:1;}
  .icon-btn{background:none;border:none;color:var(--vscode-foreground);opacity:.7;cursor:pointer;
    font-size:14px;padding:3px 6px;border-radius:4px;line-height:1;}
  .icon-btn:hover{opacity:1;background:var(--vscode-toolbar-hoverBackground);}
  /* ---- Debug Flows section ---- */
  #bugSection{border-bottom:1px solid var(--vscode-panel-border);}
  #bugHead{display:flex;align-items:center;gap:6px;padding:9px 10px 6px;}
  #bugHead h3{margin:0;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.4px;flex:1;display:flex;align-items:center;gap:6px;}
  #bugStats{font-size:11px;opacity:.55;white-space:nowrap;}
  #newProjBtn{flex:0 0 auto;}
  .rec-dot{width:8px;height:8px;border-radius:50%;background:#FFFFFF;display:none;animation:blink 1.2s ease infinite;flex:0 0 auto;}
  @keyframes blink{0%,100%{opacity:1}50%{opacity:.25}}
  /* Recording bar */
  #recBar{display:none;align-items:center;gap:8px;margin:2px 10px 8px;padding:7px 9px;border-radius:6px;
    background:var(--vscode-textCodeBlock-background);border:1px solid var(--vscode-badge-background);}
  #recInfo{flex:1;font-size:11.5px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;}
  /* Projects */
  .proj{margin:0 10px 8px;border:1px solid var(--vscode-panel-border);border-radius:7px;
    background:var(--vscode-button-secondaryBackground);overflow:hidden;}
  .proj.active{border-color:var(--vscode-focusBorder);}
  .proj-head{display:flex;align-items:center;gap:7px;padding:7px 9px;cursor:pointer;user-select:none;}
  .proj-head:hover{background:var(--vscode-list-hoverBackground);}
  .proj-name{font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
    flex:1;min-width:20px;}
  .proj-meta{font-size:10.5px;opacity:.5;white-space:nowrap;flex:0 0 auto;}
  .chip{font-size:9px;font-weight:700;letter-spacing:.5px;padding:1px 5px;border-radius:3px;
    background:var(--vscode-badge-background);color:var(--vscode-badge-foreground);flex:0 0 auto;white-space:nowrap;}
  .chev{opacity:.5;font-size:10px;transition:transform .15s;flex:0 0 auto;}
  .proj.open .proj-chev,.path.open .path-chev{transform:rotate(90deg);}
  .row-actions{display:flex;gap:1px;visibility:hidden;flex:0 0 auto;}
  .proj-head:hover .row-actions,.path-head:hover .row-actions{visibility:visible;}
  .act{background:none;border:none;color:var(--vscode-foreground);opacity:.55;cursor:pointer;
    font-size:11px;padding:2px 4px;border-radius:3px;line-height:1;}
  .act:hover{opacity:1;background:var(--vscode-toolbar-hoverBackground);}
  /* Paths */
  .paths{border-top:1px solid var(--vscode-panel-border);}
  .path-hint{padding:8px 10px;font-size:11px;opacity:.55;line-height:1.45;}
  .path{border-bottom:1px solid var(--vscode-panel-border);}
  .path:last-child{border-bottom:none;}
  .path-head{display:flex;align-items:center;gap:6px;padding:6px 9px;cursor:pointer;user-select:none;}
  .path-head:hover{background:var(--vscode-list-hoverBackground);}
  .kind-chip{font-family:monospace;font-size:9px;font-weight:700;letter-spacing:.5px;padding:1px 5px;
    border-radius:3px;flex:0 0 auto;}
  .kind-bug{background:var(--vscode-badge-background);color:var(--vscode-badge-foreground);}
  .kind-task{background:transparent;color:var(--vscode-badge-foreground);border:1px dashed var(--vscode-badge-background);}
  .path-title{font-size:11.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;min-width:20px;}
  .path-meta{font-size:10px;opacity:.45;white-space:nowrap;flex:0 0 auto;}
  /* Workflow visualization */
  .viz{background:var(--vscode-textCodeBlock-background);border-top:1px dashed var(--vscode-panel-border);
    max-height:340px;overflow:auto;padding:8px 6px;}
  .viz svg{display:block;margin:0 auto;height:auto;}
  .viz-empty{font-size:11px;opacity:.5;padding:4px;text-align:center;}
  #bugEmpty{padding:2px 12px 10px;font-size:11px;opacity:.55;line-height:1.5;}
  /* ---- Empty state ---- */
  #empty{display:flex;flex-direction:column;align-items:center;padding:48px 24px;text-align:center;gap:10px;}
  #empty .big{font-size:34px;opacity:.5;}
  #empty p{margin:0;opacity:.65;font-size:12px;line-height:1.5;}
  /* ---- Element cards ---- */
  #cards{overflow-y:auto;}
  .card{border-bottom:1px solid var(--vscode-panel-border);padding:9px 12px;cursor:pointer;}
  .card:hover{background:var(--vscode-list-hoverBackground);}
  .row{display:flex;align-items:center;gap:7px;}
  .tag-badge{font-family:monospace;font-size:11px;font-weight:600;padding:1px 6px;border-radius:3px;
    background:var(--vscode-badge-background);color:var(--vscode-badge-foreground);}
  .snippet{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;opacity:.85;font-size:12px;}
  .detail{display:none;margin-top:8px;border-left:2px solid var(--vscode-focusBorder);padding-left:10px;}
  .card.open .detail{display:block;}
  .kv{margin:3px 0;font-size:11px;}
  .kv b{opacity:.6;font-weight:400;margin-right:5px;}
  code{font-family:var(--vscode-editor-font-family,monospace);font-size:11px;
    background:var(--vscode-textCodeBlock-background);padding:1px 4px;border-radius:3px;
    word-break:break-all;display:inline-block;max-width:100%;}
  .actions{display:flex;gap:6px;margin-top:7px;}
  .mini{font-size:10px;padding:2px 8px;border-radius:3px;border:1px solid var(--vscode-button-border,transparent);
    background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground);
    cursor:pointer;}
  .mini:hover{background:var(--vscode-button-secondaryHoverBackground);}
  .mini.subtle{opacity:.7;}
  html{color-scheme:var(--vscode-color-scheme, dark);}
</style></head>
<body>
<div id="bugSection">
  <div id="bugHead">
    <h3><span class="rec-dot" id="recDot"></span>Debug Flows</h3>
    <span id="bugStats"></span>
    <button class="mini" id="newProjBtn" title="Create a new debug project">＋ New</button>
  </div>
  <div id="recBar">
    <span class="rec-dot" style="display:inline-block;"></span>
    <span id="recInfo"></span>
    <button class="mini" id="stopRecBtn" title="Finish &amp; save these steps as a path">✔ Finish</button>
    <button class="mini subtle" id="cancelRecBtn" title="Discard this recording">✕</button>
  </div>
  <div id="bugEmpty">No debug projects yet. Click <b>＋ New</b>, or press the 🐞 record button in the browser panel — clicked elements become annotated steps of a visual workflow.</div>
  <div id="projList"></div>
</div>
<div id="header">
  <h2>Element Browser</h2>
  <span id="count" style="font-size:11px;opacity:.6;"></span>
  <button class="icon-btn" id="clearBtn" title="Clear history">🗑</button>
</div>
<div id="empty">
  <div class="big">🎯</div>
  <p><b>No elements captured yet.</b><br/>
  Start inspecting your app, then click any element in the browser panel — its details will appear here.</p>
  <button class="mini" id="startBtn">▶ Start Inspecting</button>
</div>
<div id="cards"></div>
<script>
  const vscode = acquireVsCodeApi();
  let history = [];
  let bug = null; // BugView from the host
  let openProjects = {}, openPaths = {}; // expanded ids (persisted across reloads)
  let lastActivePid = null, vizSeq = 0;
  const $ = id => document.getElementById(id);

  // Restore expansion state after a webview teardown/recreation.
  (function restore(){
    try{
      const saved = vscode.getState ? vscode.getState() : null;
      if(saved && saved.bugUi){
        openProjects = saved.bugUi.projects || {};
        openPaths = saved.bugUi.paths || {};
      }
    }catch(e){}
  })();
  function saveBugUi(){
    try{ vscode.setState({ bugUi:{ projects: openProjects, paths: openPaths } }); }catch(e){}
  }

  function timeAgo(ts){
    const d = Date.now() - (Number(ts)||0);
    if(d < 60e3) return 'just now';
    if(d < 3600e3) return Math.floor(d/60e3) + 'm';
    if(d < 86400e3) return Math.floor(d/3600e3) + 'h';
    if(d < 7*86400e3) return Math.floor(d/86400e3) + 'd';
    return new Date(ts).toLocaleDateString();
  }

  function iconBtn(glyph, title, fn){
    const b = document.createElement('button');
    b.className = 'act'; b.textContent = glyph; b.title = title;
    b.onclick = ev => { ev.stopPropagation(); fn(ev); };
    return b;
  }

  // ================= Workflow visualization =================
  // Vertical node graph: numbered cards connected by S-curved arrows.
  function escSvg(s){
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function workflowSvg(steps, W){
    if(!steps || !steps.length) return '<div class="viz-empty">No steps recorded.</div>';
    const padT = 18, nodeH = 46, gap = 26, numR = 9, padL = 28, padR = 8;
    const nodeW = Math.max(120, W - padL - padR);
    const cx = padL + nodeW / 2;
    const H = steps.length * (nodeH + gap) - gap + padT * 2;
    const mid = 'vz' + (++vizSeq);
    let s = '<svg xmlns="http://www.w3.org/2000/svg" width="'+W+'" height="'+H+'" viewBox="0 0 '+W+' '+H+'">';
    s += '<defs><marker id="'+mid+'" markerWidth="7" markerHeight="7" refX="5.5" refY="3.5" orient="auto">' +
         '<path d="M0,0 L6,3.5 L0,7 Z" fill="#75715E"/></marker></defs>';
    steps.forEach((st, i) => {
      const y = padT + i * (nodeH + gap);
      const cy = y + nodeH / 2;
      if(i > 0){
        const py = padT + (i - 1) * (nodeH + gap) + nodeH;
        const my = (py + y) / 2;
        s += '<path d="M '+cx+' '+(py+2)+' C '+(cx+20)+' '+my+', '+(cx-20)+' '+my+', '+cx+' '+(y-5)+'"' +
             ' stroke="#75715E" stroke-width="1.6" fill="none" marker-end="url(#'+mid+')"/>';
      }
      s += '<circle cx="'+(numR+2)+'" cy="'+cy+'" r="'+numR+'" fill="#75715E"/>' +
           '<text x="'+(numR+2)+'" y="'+(cy+3.5)+'" text-anchor="middle" font-size="10" font-weight="700" fill="#F8F8F2">'+(i+1)+'</text>';
      s += '<rect x="'+padL+'" y="'+y+'" rx="7" width="'+nodeW+'" height="'+nodeH+'" fill="#414339" stroke="#75715E" stroke-width="1"/>';
      const label = '<'+st.tag+'>'+ (st.id ? '#'+String(st.id).slice(0,12) : '');
      s += '<text x="'+(padL+12)+'" y="'+(y+19)+'" font-size="11" font-family="monospace" fill="#F8F8F2">'+escSvg(label)+'</text>';
      const note = st.note ? (String(st.note).length > 40 ? String(st.note).slice(0,39)+'…' : st.note) : '(no note)';
      s += '<text x="'+(padL+12)+'" y="'+(y+35)+'" font-size="10" fill="#75715E" font-style="italic">'+escSvg(note)+'</text>';
    });
    return s + '</svg>';
  }

  // ================= Render: projects & paths =================
  function buildPathRow(p, pt){
    const isOpen = !!openPaths[pt.id];
    const wrap = document.createElement('div');
    wrap.className = 'path' + (isOpen ? ' open' : '');

    const head = document.createElement('div'); head.className = 'path-head';
    const chev = document.createElement('span'); chev.className = 'chev path-chev'; chev.textContent = '▶';
    const kind = document.createElement('span');
    kind.className = 'kind-chip ' + (pt.kind === 'task' ? 'kind-task' : 'kind-bug');
    kind.textContent = pt.kind === 'task' ? 'TASK' : 'BUG';
    kind.title = pt.kind === 'task' ? 'Task flow' : 'Bug reproduction';
    const title = document.createElement('span'); title.className = 'path-title';
    title.textContent = pt.title; title.title = pt.title;
    const meta = document.createElement('span'); meta.className = 'path-meta';
    meta.textContent = pt.steps.length + (pt.steps.length===1?' step':' steps') + ' · ' + timeAgo(pt.createdAt);
    const acts = document.createElement('div'); acts.className = 'row-actions';
    acts.appendChild(iconBtn('⧉','Copy report (markdown)', () => vscode.postMessage({type:'copyPath', pid:p.id, id:pt.id})));
    acts.appendChild(iconBtn('⤓','Save report as .md', () => vscode.postMessage({type:'exportPath', pid:p.id, id:pt.id})));
    acts.appendChild(iconBtn('🗑','Delete path', () => vscode.postMessage({type:'deletePath', pid:p.id, id:pt.id})));
    head.appendChild(chev); head.appendChild(kind); head.appendChild(title); head.appendChild(meta); head.appendChild(acts);
    head.onclick = () => { openPaths[pt.id] = !openPaths[pt.id]; saveBugUi(); renderBug(); };
    wrap.appendChild(head);

    if(isOpen){
      const viz = document.createElement('div'); viz.className = 'viz';
      wrap.appendChild(viz);
      // Measure once the row is in the DOM, then draw the diagram at full width.
      requestAnimationFrame(() => { viz.innerHTML = workflowSvg(pt.steps, viz.clientWidth || 250); });
    }
    return wrap;
  }

  function renderBug(){
    const sec = $('bugSection');
    if(!bug){ sec.style.display = 'none'; return; }
    sec.style.display = 'block';
    $('recDot').style.display = bug.recordingActive ? 'inline-block' : 'none';

    let totalPaths = 0;
    bug.projects.forEach(p => { totalPaths += p.paths.length; });
    $('bugStats').textContent = bug.projects.length
      ? bug.projects.length + (bug.projects.length===1?' project':' projects') + ' · ' + totalPaths + (totalPaths===1?' path':' paths')
      : '';

    const rb = $('recBar');
    rb.style.display = bug.recordingActive ? 'flex' : 'none';
    if(bug.recordingActive){
      $('recInfo').textContent = 'REC · ' + bug.recordingSteps + ' step' + (bug.recordingSteps===1?'':'s') +
        (bug.recordingProjectName ? ' · ' + bug.recordingProjectName : '');
    }

    $('bugEmpty').style.display = bug.projects.length ? 'none' : 'block';

    const list = $('projList'); list.innerHTML = '';
    bug.projects.forEach(p => {
      const isOpen = !!openProjects[p.id];
      const isActive = p.id === bug.activeProjectId;
      const card = document.createElement('div');
      card.className = 'proj' + (isOpen ? ' open' : '') + (isActive ? ' active' : '');

      const head = document.createElement('div'); head.className = 'proj-head';
      const chev = document.createElement('span'); chev.className = 'chev proj-chev'; chev.textContent = '▶';
      const name = document.createElement('span'); name.className = 'proj-name'; name.textContent = p.name;
      name.title = isActive ? '"' + p.name + '" — recording target' : 'Click to make "' + p.name + '" the recording target';
      const meta = document.createElement('span'); meta.className = 'proj-meta';
      meta.textContent = p.paths.length + (p.paths.length===1?' path':' paths');
      const acts = document.createElement('div'); acts.className = 'row-actions';
      acts.appendChild(iconBtn('✎','Rename project', () => vscode.postMessage({type:'renameProject', id:p.id})));
      acts.appendChild(iconBtn('⧉','Copy ALL path reports', () => vscode.postMessage({type:'copyProject', pid:p.id})));
      acts.appendChild(iconBtn('🗑','Delete project', () => vscode.postMessage({type:'deleteProject', id:p.id})));

      head.appendChild(chev); head.appendChild(name);
      if(isActive){
        const chip = document.createElement('span'); chip.className = 'chip';
        chip.textContent = '● REC TARGET'; chip.title = 'New recordings are saved into this project';
        head.appendChild(chip);
      }
      head.appendChild(meta); head.appendChild(acts);

      head.onclick = () => {
        openProjects[p.id] = !openProjects[p.id];
        saveBugUi();
        renderBug();
        if(openProjects[p.id]) vscode.postMessage({type:'selectProject', id:p.id});
      };
      card.appendChild(head);

      if(isOpen){
        const body = document.createElement('div'); body.className = 'paths';
        if(!p.paths.length){
          const hint = document.createElement('div'); hint.className = 'path-hint';
          hint.textContent = 'No paths yet — press the 🐞 record button in the browser panel, click elements in order, then Finish.';
          body.appendChild(hint);
        }
        p.paths.forEach(pt => body.appendChild(buildPathRow(p, pt)));
        card.appendChild(body);
      }
      list.appendChild(card);
    });
  }

  // ================= Render: captured elements =================
  function render(){
    $('count').textContent = history.length ? history.length + ' captured' : '';
    $('empty').style.display = history.length ? 'none' : 'flex';
    const cards = $('cards'); cards.innerHTML = '';
    [...history].reverse().forEach((d) => {
      const card = document.createElement('div'); card.className = 'card';
      const row = document.createElement('div'); row.className = 'row';
      const tag = document.createElement('span'); tag.className = 'tag-badge'; tag.textContent = '<' + (d.tag||'?') + '>';
      const snip = document.createElement('span'); snip.className = 'snippet';
      snip.textContent = d.text ? '"' + d.text.slice(0,40) + '"' : (d.id ? '#'+d.id : d.cssSelector || '');
      snip.title = snip.textContent;
      const chev = document.createElement('span'); chev.className = 'chev'; chev.textContent = '▶';
      row.appendChild(tag); row.appendChild(snip); row.appendChild(chev);
      card.appendChild(row);

      const det = document.createElement('div'); det.className = 'detail';
      det.innerHTML =
        '<div class="kv"><b>URL</b><code>'+esc(d.url||'')+'</code></div>' +
        '<div class="kv"><b>ID</b>' + (d.id ? '<code>'+esc(d.id)+'</code>' : '<i style="opacity:.5">—</i>') + '</div>' +
        '<div class="kv"><b>CLASS</b>' + (d.className ? '<code>'+esc(d.className)+'</code>' : '<i style="opacity:.5">—</i>') + '</div>' +
        '<div class="kv"><b>XPATH</b><code>'+esc(d.xpath||'')+'</code></div>' +
        '<div class="kv"><b>CSS</b><code>'+esc(d.cssSelector||'')+'</code></div>' +
        (d.source ? '<div class="kv"><b>SOURCE</b><code>'+esc(d.source.file+':'+d.source.line)+'</code></div>' : '');
      const actions = document.createElement('div'); actions.className = 'actions';
      actions.innerHTML = '<button class="mini" data-a="context">Copy Full Context</button>' +
        '<button class="mini" data-a="xpath">Copy XPath</button>' +
        '<button class="mini" data-a="css">Copy CSS</button>' +
        '<button class="mini" data-a="html">Copy HTML</button>' +
        '<button class="mini" data-a="details">Details…</button>';
      actions.querySelectorAll('.mini').forEach(btn => {
        btn.onclick = function(ev){
          ev.stopPropagation();
          const a = btn.getAttribute('data-a');
          if(a === 'context') vscode.postMessage({type:'copy', value:d.contextText || d.outerHTML || ''});
          else if(a === 'xpath') vscode.postMessage({type:'copy', value:d.xpath||''});
          else if(a === 'css') vscode.postMessage({type:'copy', value:d.cssSelector||''});
          else if(a === 'html') vscode.postMessage({type:'copy', value:d.outerHTML||''});
          else vscode.postMessage({type:'showDetails', data:d});
        };
      });
      det.appendChild(actions);
      card.appendChild(det);
      card.onclick = () => card.classList.toggle('open');
      cards.appendChild(card);
    });
  }
  function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  window.addEventListener('message', ev => {
    const m = ev.data;
    if(m && m.type === 'elements'){ history = m.history || []; render(); }
    if(m && m.type === 'bug'){
      bug = m.data || { projects:[], activeProjectId:null, recordingActive:false, recordingSteps:0, recordingProjectName:null };
      if(bug.activeProjectId && (!lastActivePid || lastActivePid !== bug.activeProjectId)){
        openProjects[bug.activeProjectId] = true;
      }
      if(bug.recordingActive && bug.activeProjectId){ openProjects[bug.activeProjectId] = true; }
      lastActivePid = bug.activeProjectId;
      saveBugUi();
      renderBug();
    }
  });
  $('clearBtn').onclick = () => vscode.postMessage({type:'clearHistory'});
  $('startBtn').onclick = () => vscode.postMessage({type:'start'});
  $('newProjBtn').onclick = () => vscode.postMessage({type:'newProject'});
  $('stopRecBtn').onclick = () => vscode.postMessage({type:'stopRec'});
  $('cancelRecBtn').onclick = () => vscode.postMessage({type:'cancelRec'});
  vscode.postMessage({type:'sidebarReady'});
</script>
</body></html>`;
}
//# sourceMappingURL=sidebarHtml.js.map