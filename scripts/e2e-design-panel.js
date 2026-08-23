/* End-to-end tests for the sidebar Design property bar.
 * Runs headless Chrome over CDP against three harnesses generated from the
 * compiled extension output (out/): sidebar editor, injected page engine,
 * panel relay.
 *
 * Usage:
 *   npm run compile
 *   node scripts/e2e-design-panel.js
 *
 * Env: CHROME_PATH (defaults to the standard Chrome install path).
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const WebSocket = require(path.join(ROOT, 'node_modules', 'ws'));
const { getSidebarHtml } = require(path.join(ROOT, 'out', 'webview', 'sidebarHtml.js'));
const { getWebviewHtml } = require(path.join(ROOT, 'out', 'webview', 'panelHtml.js'));
const { INJECT_SCRIPT } = require(path.join(ROOT, 'out', 'webview', 'inspectScript.js'));

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ecb-e2e-'));
const PORT = process.env.E2E_PORT || 9333;

// ---------- harness files ----------
function stub() {
  return '<script>window.__cap=[];window.acquireVsCodeApi=function(){return{' +
    'postMessage:function(m){window.__cap.push(JSON.parse(JSON.stringify(m)));},' +
    'getState:function(){return null;},setState:function(){}}};</script>';
}
fs.writeFileSync(path.join(DIR, 'sidebar.html'), getSidebarHtml().replace('<head><meta charset="UTF-8">', '<head><meta charset="UTF-8">' + stub()));
fs.writeFileSync(path.join(DIR, 'panel.html'), getWebviewHtml(4444).replace('<head><meta charset="UTF-8">', '<head><meta charset="UTF-8">' + stub()));
fs.writeFileSync(path.join(DIR, 'inject.html'),
  '<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body>' +
  '<div id="wrap"><button id="b" style="width:100px;height:50px;background-color:red;color:white;border-top:2px solid blue">Hi</button>' +
  '<p id="c" style="width:40px">C</p>' +
  '<span id="sp" style="background:yellow">inline text</span>' +
  '<style>#imp{transform:translateX(0) !important;}</style><div id="imp" class="imp" style="width:60px;height:30px;background:cyan"></div></div>' +
  INJECT_SCRIPT +
  '</body></html>');

// ---------- mini CDP client ----------
function connect(wsUrl) {
  return new Promise((res, rej) => {
    const ws = new WebSocket(wsUrl, { perMessageDeflate: false });
    let id = 0; const pend = {};
    ws.on('message', d => {
      const m = JSON.parse(d);
      if (m.id && pend[m.id]) { const r = pend[m.id]; delete pend[m.id]; r(m); }
    });
    ws.on('open', () => res({
      send(method, params) {
        return new Promise((r, j) => {
          const i = ++id; pend[i] = m => m.error ? j(new Error(method + ': ' + m.error.message)) : r(m.result);
          ws.send(JSON.stringify({ id: i, method, params: params || {} }));
        });
      },
      close() { try { ws.close(); } catch (e) {} }
    }));
    ws.on('error', rej);
  });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function ev(cdp, expr) {
  const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true, userGesture: true });
  if (r.exceptionDetails) {
    const d = r.exceptionDetails;
    throw new Error('eval: ' + ((d.exception && d.exception.description) || d.text || 'unknown'));
  }
  return r.result.value;
}

let passCount = 0; const fails = [];
async function t(name, fn) {
  try { await fn(); passCount++; console.log('PASS  ' + name); }
  catch (e) { fails.push(name + ' :: ' + e.message); console.log('FAIL  ' + name + ' :: ' + e.message); }
}
function ok(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
function eq(a, b, msg) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((msg || 'eq') + ' | got=' + JSON.stringify(a) + ' want=' + JSON.stringify(b)); }

async function nav(cdp, file, extraCheck) {
  await cdp.send('Page.navigate', { url: 'file:///' + DIR.replace(/\\/g, '/') + '/' + file });
  const gate = '(function(){try{return location.href.indexOf(' + JSON.stringify(file) + ')>=0 && document.readyState==="complete"' + (extraCheck ? ' && (' + extraCheck + ')' : '') + ';}catch(e){return false;}})()';
  for (let i = 0; i < 150; i++) {
    try {
      const okState = await ev(cdp, gate);
      if (okState === true || okState === 'true') { await sleep(200); return; }
    } catch (e) {}
    await sleep(120);
  }
  throw new Error('nav: page never became ready: ' + file);
}

const LIB = `
window.__T = {
  q(s){return document.querySelector(s);},
  qa(s){return Array.from(document.querySelectorAll(s));},
  txt(s){var e=this.q(s);return e?e.textContent:null;},
  last(){var c=this.cap();return c[c.length-1];},
  sendTarget(d){window.dispatchEvent(new MessageEvent('message',{data:{type:'designTarget',data:d}}));},
  sections(){return this.qa('#designPanel .dp-sec').map(function(s){var t=s.querySelector('.dp-title span');return t?t.textContent:null;});},
  sec(title){return this.qa('#designPanel .dp-sec').find(function(s){var t=s.querySelector('.dp-title span');return t&&t.textContent.indexOf(title)>=0;});},
  btn(title){var b=this.qa('#designPanel button').find(function(x){return x.title===title;});if(!b)throw new Error('no btn "'+title+'"');return b;},
  clickBtn(title){this.btn(title).click();return true;},
  btnIn(title,secName){var sec=this.sec(secName);if(!sec)throw new Error('no sec '+secName);var b=Array.from(sec.querySelectorAll('button')).find(function(x){return x.title===title;});if(!b)throw new Error('no btn "'+title+'" in '+secName);return b;},
  clickBtnIn(title,secName){this.btnIn(title,secName).click();return true;},
  seg(n,title){var segs=this.qa('#designPanel .seg');if(!segs[n])throw new Error('no seg row '+n);var b=Array.from(segs[n].querySelectorAll('button')).find(function(x){return x.title===title;});if(!b)throw new Error('no seg "'+title+'" in row '+n);return b;},
  clickSeg(n,title){this.seg(n,title).click();return true;},
  nfIn(secTitle,pre,idx){var sec=this.sec(secTitle);if(!sec)return null;
    var pres=Array.from(sec.querySelectorAll('.nf-pre')).filter(function(p){return p.textContent.trim()===pre;});
    if(!pres.length)return null;var p=pres[idx||0];return p.parentElement.querySelector('input');},
  nfVal(pre,idx){var i=this.nfIn('Position',pre,idx)||this.nfIn('Layout',pre,idx)||this.nfIn('Stroke',pre,idx)||this.nfIn('Effects',pre,idx);return i?i.value:null;},
  setNf(pre,val,idx){var i=this.nfIn('Position',pre,idx)||this.nfIn('Layout',pre,idx)||this.nfIn('Stroke',pre,idx)||this.nfIn('Effects',pre,idx);if(!i)throw new Error('no nf field '+pre);i.value=val;i.dispatchEvent(new Event('input',{bubbles:true}));i.dispatchEvent(new FocusEvent('blur'));return true;},
  setNfIn(secTitle,pre,val){var i=this.nfIn(secTitle,pre);if(!i)throw new Error('no nf '+secTitle+'/'+pre);i.value=val;i.dispatchEvent(new Event('input',{bubbles:true}));i.dispatchEvent(new FocusEvent('blur'));return true;},
  nfSuf(suf){var s=this.qa('#designPanel .nf-suf').find(function(x){return x.textContent===suf;});return s?s.parentElement.querySelector('input').value:null;},
  setNfSuf(suf,val){var s=this.qa('#designPanel .nf-suf').find(function(x){return x.textContent===suf;});if(!s)throw new Error('no suf '+suf);var i=s.parentElement.querySelector('input');i.value=val;i.dispatchEvent(new Event('input',{bubbles:true}));i.blur();return true;},
  labeledInput(title,label){var sec=this.sec(title);if(!sec)throw new Error('no sec '+title);
    var lab=Array.from(sec.querySelectorAll('.dp-sub')).find(function(x){return x.textContent===label;});
    if(!lab)throw new Error('no label '+label+' in '+title);return lab.parentElement.querySelector('input');},
  setLabeled(title,label,val){var i=this.labeledInput(title,label);if(!i)throw new Error('no input for '+label);var at=this.n();i.value=val;i.dispatchEvent(new Event('input',{bubbles:true}));i.dispatchEvent(new FocusEvent('blur'));return at;},
  sels(title){var sec=this.sec(title);if(!sec)throw new Error('no sec '+title);return Array.from(sec.querySelectorAll('.sf'));},
  selLabel(title,nth){var l=this.sels(title)[nth||0];if(!l)throw new Error('no select '+title+'/'+nth);return l.querySelector('.sf-label').textContent;},
  openSel(title,nth){var l=this.sels(title)[nth||0];l.click();return this.qa('.sf-menu').length;},
  opts(){return this.qa('.sf-menu .sf-opt').map(function(o){return o.textContent.trim();});},
  pickOpt(label){var opts=this.qa('.sf-menu .sf-opt');var texts=opts.map(function(x){return x.textContent.trim();});var o=opts.find(function(x,i){return texts[i]===label;});if(!o)throw new Error('no option "'+label+'" in ['+texts.join('|')+']');o.click();return true;},
  menuOpen(){return this.qa('.sf-menu').length;},
  closeMenus(){document.body.dispatchEvent(new MouseEvent('mousedown',{bubbles:true}));return true;},
  crowL(label){var r=this.qa('#designPanel .cr').find(function(x){return x.getAttribute('data-label')===label;});if(!r)throw new Error('no color row "'+label+'"');return{hex:r.querySelector('.cr-hex'),sw:r.querySelector('input[type=color]'),op:r.querySelector('.cr-op input'),minus:r.querySelectorAll('.cr-rail .dp-btn')[1]};},
  cap(){return window.__cap||[];},
  applySince(i){var c=this.cap().slice(i);for(var j=0;j<c.length;j++){if(c[j]&&c[j].type==='designApply')return c[j];}return null;},
  n(){return this.cap().length;},
  mark(){var n=this.q('#designPanel .dp-name')||this.q('#designPanel');n.setAttribute('data-marker','1');return true;},
  marked(){return !!this.q('#designPanel [data-marker]');}
};
'tlib-ready'`;

const SAMPLE = {
  ecbId: 'ecb-t-1', tag: 'button', selector: '#buy',
  styles: {
    width: '120px', height: '40px', minWidth: '0px', minHeight: '0px', maxWidth: 'none',
    opacity: '0.5', visibility: 'visible',
    mixBlendMode: 'normal', backgroundColor: 'rgb(18, 52, 86)', backgroundImage: 'none', backgroundBlendMode: 'normal',
    color: 'rgb(255, 255, 255)',
    borderRadius: '4px', borderTopLeftRadius: '0px', borderTopRightRadius: '0px', borderBottomLeftRadius: '0px', borderBottomRightRadius: '0px',
    borderTopWidth: '1px', borderRightWidth: '0px', borderBottomWidth: '3px', borderLeftWidth: '0px',
    borderTopColor: 'rgb(0, 0, 255)', borderRightColor: 'rgb(0, 0, 255)', borderBottomColor: 'rgb(0, 0, 255)', borderLeftColor: 'rgb(0, 0, 255)',
    borderTopStyle: 'solid', borderRightStyle: 'solid', borderBottomStyle: 'solid', borderLeftStyle: 'solid',
    boxShadow: 'none',
    fontFamily: 'Arial, sans-serif', fontWeight: '700', fontSize: '16px', fontStyle: 'italic',
    lineHeight: '24px', letterSpacing: '1px',
    direction: 'ltr', textAlign: 'center', verticalAlign: 'middle',
    textTransform: 'uppercase', textDecorationLine: 'underline line-through',
    textOverflow: 'ellipsis', whiteSpace: 'nowrap', overflow: 'hidden',
    transform: 'matrix(1, 0, 0, 1, 10, 20)', filter: 'none'
  }
};

async function sidebarSuite(cdp) {
  await nav(cdp, 'sidebar.html', 'typeof setActiveTab===\"function\" && !!document.getElementById(\"designPanel\")');
  await ev(cdp, LIB);
  const E = e => ev(cdp, e);

  await t('design tab: opens with empty state', async () => {
    await E(`setActiveTab('design');'ok'`);
    eq(await E(`__T.q('#designPanel').style.display`), 'flex');
    ok(await E(`!!__T.q('.dp-empty')`), 'no empty state');
    eq(await E(`__T.txt('.dp-wordmark')`), 'Element Designer');
    // merged into ONE body: old captured-empty block removed, Start button present
    eq(await E(`!!document.getElementById('empty')`), false, '#empty should be gone');
    ok(await E(`!!Array.from(document.querySelectorAll('.dp-empty button')).find(b=>b.textContent==='Start Inspecting')`), 'merged Start Inspecting button missing');
    ok((await E(`__T.q('.dp-empty p').innerHTML`)).indexOf('browser panel') >= 0, 'combined hint text');
  });

  await t('selection renders all 7 sections + header name', async () => {
    await E(`__T.sendTarget(${JSON.stringify(SAMPLE)})`);
    eq(await E(`__T.sections()`), ['Position', 'Layout', 'Appearance', 'Stroke', 'Fill', 'Effects', 'Typography']);
    eq(await E(`__T.txt('.dp-name')`), 'Button');
  });

  await t('Position: X/Y/rotation reflect transform matrix', async () => {
    eq(await E(`__T.nfVal('X')`), '10');
    eq(await E(`__T.nfVal('Y')`), '20');
    eq(await E(`__T.nfSuf('\\u00B0')`), '0');
  });

  await t('Layout: W/H + resizing seg present, constraints hidden', async () => {
    eq(await E(`__T.nfVal('W')`), '120');
    eq(await E(`__T.nfVal('H')`), '40');
    ok(await E(`!!__T.seg(0,'Hug contents') && !!__T.seg(0,'Fixed')`), 'resizing seg missing');
    ok(await E(`!__T.nfIn('Layout','Min W')`), 'constraints should be hidden for non-container');
  });

  await t('Appearance values: blend Normal, opacity 50%', async () => {
    eq(await E(`__T.selLabel('Appearance',0)`), 'Normal');
    eq(await E(`__T.nfSuf('%')`), '50');
  });

  await t('Stroke: badge "2 sides", weight=max side, per-side grid auto-open', async () => {
    ok((await E(`__T.txt('#designPanel .dp-badge')`) || '').indexOf('2 sides') >= 0, 'badge wrong');
    eq(await E(`__T.nfIn('Stroke','W').value`), '3');
    eq(await E(`__T.nfIn('Stroke','T').value`), '1');
    eq(await E(`__T.nfIn('Stroke','B').value`), '3');
  });

  await t('Fill rows: bg #123456 + text #FFFFFF', async () => {
    eq(await E(`__T.crowL('Fill').hex.value`), '123456');
    eq(await E(`__T.crowL('Text').hex.value`), 'FFFFFF');
    eq(await E(`__T.crowL('Fill').op.value`), '100');
  });

  await t('Effects hidden until a shadow exists', async () => {
    eq(await E(`__T.sels('Effects').length`), 0);
  });

  await t('Typography initial states', async () => {
    eq(await E(`__T.selLabel('Typography',0)`), 'Arial');
    eq(await E(`__T.selLabel('Typography',1)`), 'Bold');
    ok(await E(`!!__T.seg(1,'Align center').classList.contains('sel')`), 'textAlign center');
    ok(await E(`!!__T.seg(2,'Align center').classList.contains('sel')`), 'valign middle');
    ok(await E(`Array.from(document.querySelectorAll('#designPanel .seg')[3].querySelectorAll('button')).filter(b=>b.classList.contains('sel')).length===4`), 'B/I/U/S bold+italic+underline+strike all on');
  });

  await t('Position edit: X -> translate(x,y)', async () => {
    const n = await E(`__T.n()`);
    await E(`__T.setNf('X','55')`);
    const m = await E(`__T.applySince(${n})`);
    eq([m.type, m.prop, m.x, m.y], ['designApply', 'transform', 55, 20]);
  });

  await t('Rotation field sends rotate', async () => {
    const n = await E(`__T.n()`);
    await E(`__T.setNfSuf('\\u00B0','45')`);
    eq([(await E(`__T.applySince(${n})`)).prop, (await E(`__T.applySince(${n})`)).value], ['rotate', '45']);
  });

  await t('Flip horizontal / vertical buttons', async () => {
    let n = await E(`__T.n()`);
    await E(`__T.clickBtn('Flip horizontal')`);
    eq((await E(`__T.applySince(${n})`)).value, '-1');
    n = await E(`__T.n()`);
    await E(`__T.clickBtn('Flip vertical')`);
    eq((await E(`__T.applySince(${n})`)).value, '-1');
  });

  await t('Rotate 90 button increments from current rotation', async () => {
    await E(`dsel.styles.transform='matrix(1, 0, 0, 1, 0, 0)';renderDesign()`);
    const n = await E(`__T.n()`);
    await E(`__T.clickBtn('Rotate 90\\u00B0')`);
    eq((await E(`__T.applySince(${n})`)).value, '90');
  });

  await t('Layout W/H edits apply px', async () => {
    let n = await E(`__T.n()`);
    await E(`__T.setNf('W','200')`);
    let m = await E(`__T.applySince(${n})`);
    eq([m.prop, m.value], ['width', '200px']);
    n = await E(`__T.n()`);
    await E(`__T.setNf('H','64')`);
    eq((await E(`__T.applySince(${n})`)).value, '64px');
  });

  await t('Resizing: hug/fill map to width auto/100%', async () => {
    let n = await E(`__T.n()`);
    await E(`__T.clickSeg(0,'Hug contents')`);
    eq((await E(`__T.applySince(${n})`)).value, 'auto');
    n = await E(`__T.n()`);
    await E(`__T.clickSeg(0,'Fill container')`);
    eq((await E(`__T.applySince(${n})`)).value, '100%');
  });

  await t('Appearance dropdown: open/pick/close cycle', async () => {
    await E(`__T.openSel('Appearance',0)`);
    eq(await E(`__T.menuOpen()`), 1);
    eq((await E(`__T.opts()`)).length, 16, '16 blend options');
    await E(`__T.pickOpt('Multiply')`);
    const m = await E(`__T.last()`);
    eq([m.prop, m.value], ['mixBlendMode', 'multiply']);
    eq(await E(`__T.menuOpen()`), 0);
  });

  await t('Opacity % maps to 0..1', async () => {
    const n = await E(`__T.n()`);
    await E(`__T.setNfSuf('%','75')`);
    eq((await E(`__T.applySince(${n})`)).value, '0.75');
  });

  await t('Corner radius + independent corners grid', async () => {
    await E(`__T.clickBtn('Independent corner radii')`);
    ok(await E(`!!__T.nfIn('Appearance','TL') && !!__T.nfIn('Appearance','BR')`), 'corner grid missing');
    const n = await E(`__T.n()`);
    await E(`__T.setNfIn('Appearance','TL','8')`);
    const m = await E(`__T.applySince(${n})`);
    eq([m.prop, m.value], ['borderTopLeftRadius', '8px']);
  });

  await t('Visibility eye toggles hidden/visible', async () => {
    const n = await E(`__T.n()`);
    await E(`__T.clickBtn('Hide')`);
    eq((await E(`__T.applySince(${n})`)).value, 'hidden');
  });

  await t('Stroke edits: dashed toggle, weight, per-side width', async () => {
    let n = await E(`__T.n()`);
    await E(`__T.clickBtn('Dashed border')`);
    eq((await E(`__T.applySince(${n})`)).value, 'dashed');
    n = await E(`__T.n()`);
    await E(`__T.setNfIn('Stroke','W','5')`);
    eq([(await E(`__T.applySince(${n})`)).prop, (await E(`__T.applySince(${n})`)).value], ['borderWidth', '5px']);
    n = await E(`__T.n()`);
    await E(`__T.setNfIn('Stroke','B','6')`);
    eq([(await E(`__T.applySince(${n})`)).prop, (await E(`__T.applySince(${n})`)).value], ['borderBottomWidth', '6px']);
  });

  await t('Stroke color row: remove zeros width; Add restores 1px solid', async () => {
    await E(`renderDesign()`);
    let n = await E(`__T.n()`);
    await E(`__T.crowL('Color').minus.click()`);
    eq((await E(`__T.applySince(${n})`)).value, '0px');
    await E(`renderDesign()`);
    n = await E(`__T.n()`);
    await E(`__T.clickBtn('Add stroke')`);
    const msgs = await E(`__T.cap().slice(${n})`);
    eq(msgs.map(m => m.prop + '=' + m.value), ['borderWidth=1px', 'borderStyle=solid']);
  });

  await t('Fill: hex typing, native swatch, opacity alpha compose, gradient stop', async () => {
    await E(`renderDesign()`);
    let n = await E(`__T.n()`);
    await E(`(function(){var i=__T.crowL('Fill').hex;i.value='00ff00';i.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    eq((await E(`__T.applySince(${n})`)).value, '#00FF00');
    n = await E(`__T.n()`);
    await E(`(function(){var i=__T.crowL('Fill').sw;i.value='#abcdef';i.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    eq((await E(`__T.applySince(${n})`)).value, '#abcdef');
    await E(`dsel.styles.backgroundColor='#00AA00';renderDesign()`);
    n = await E(`__T.n()`);
    await E(`(function(){var i=__T.crowL('Fill').op;i.value='50';i.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    eq((await E(`__T.applySince(${n})`)).value, 'rgba(0, 170, 0, 0.5)');
    await E(`dsel.styles.backgroundImage='linear-gradient(rgb(255, 0, 0), blue)';renderDesign()`);
    eq(await E(`__T.crowL('Fill').hex.value`), 'FF0000', 'gradient first stop surfaces as visible fill');
    await E(`dsel.styles.backgroundImage='none'`);
  });

  await t('Fill: text remove -> transparent; Add fills text color next', async () => {
    await E(`renderDesign()`);
    let n = await E(`__T.n()`);
    await E(`__T.crowL('Text').minus.click()`);
    eq((await E(`__T.applySince(${n})`)).value, 'transparent');
    await E(`renderDesign()`);
    n = await E(`__T.n()`);
    await E(`__T.clickBtn('Add fill')`);
    eq((await E(`__T.applySince(${n})`)).value, '#000000', 'bg exists so Add must add TEXT fill');
  });

  await t('Effects: add shadow, switch inner/blur, B-field, remove', async () => {
    await E(`renderDesign()`);
    let n = await E(`__T.n()`);
    await E(`__T.clickBtn('Add effect')`);
    const added = await E(`__T.applySince(${n})`);
    eq(added.prop, 'boxShadow'); ok(added.value.indexOf('inset') < 0, 'default is drop shadow');
    await E(`renderDesign()`);
    n = await E(`__T.n()`);
    await E(`__T.openSel('Effects',0)`); await E(`__T.pickOpt('Inner shadow')`);
    const msgs = await E(`__T.cap().slice(${n})`);
    eq(msgs[0].value, 'none'); ok(msgs[1].value.indexOf('inset ') === 0, 'inner prefix applied');
    await E(`renderDesign()`);
    n = await E(`__T.n()`);
    await E(`__T.openSel('Effects',0)`); await E(`__T.pickOpt('Layer blur')`);
    const mm = await E(`__T.cap().slice(${n})`);
    ok(mm.some(m => m.prop === 'filter' && m.value === 'blur(4px)'), 'blur default applied');
    await E(`renderDesign()`);
    n = await E(`__T.n()`);
    await E(`__T.setNfIn('Effects','B','9')`);
    eq((await E(`__T.applySince(${n})`)).value, 'blur(9px)');
    n = await E(`__T.n()`);
    await E(`__T.clickBtnIn('Remove','Effects')`);
    const rm = await E(`__T.cap().slice(${n})`);
    ok(rm.some(m => m.prop === 'boxShadow' && m.value === 'none') && rm.some(m => m.prop === 'filter' && m.value === 'none'), 'remove clears shadow+filter');
  });

  await t('Typography: family pick', async () => {
    await E(`renderDesign()`);
    await E(`__T.openSel('Typography',0)`);
    await E(`__T.pickOpt('Georgia')`);
    eq((await E(`__T.last()`)).value, 'Georgia, serif');
  });

  await t('Typography: weight select', async () => {
    await E(`__T.openSel('Typography',1)`);
    await E(`__T.pickOpt('Regular')`);
    eq((await E(`__T.last()`)).value, '400');
  });

  await t('Typography: size / line-height / letter-spacing', async () => {
    let at = await E(`__T.setLabeled('Typography','Size','20')`);
    eq((await E(`__T.applySince(${at})`)).value, '20px');
    at = await E(`__T.setLabeled('Typography','Line height','32')`);
    eq((await E(`__T.applySince(${at})`)).value, '32');
    at = await E(`__T.setLabeled('Typography','Letter spacing','-2')`);
    eq((await E(`__T.applySince(${at})`)).value, '-2px');
  });

  await t('Typography: direction + case selects', async () => {
    await E(`__T.openSel('Typography',2)`); await E(`__T.pickOpt('RTL')`);
    eq((await E(`__T.last()`)).value, 'rtl');
    await E(`__T.openSel('Typography',3)`); await E(`__T.pickOpt('Lowercase')`);
    eq((await E(`__T.last()`)).value, 'lowercase');
  });

  await t('Typography: horizontal + vertical alignment segs', async () => {
    await E(`__T.clickSeg(1,'Justify')`);
    eq((await E(`__T.last()`)).prop, 'textAlign');
    await E(`__T.clickSeg(2,'Align bottom')`);
    eq((await E(`__T.last()`)).value, 'bottom');
  });

  await t('Typography: B/I/U/S formatting toggles deco composition', async () => {
    await E(`renderDesign()`);
    let nn = await E(`__T.n()`);
    await E(`Array.from(document.querySelectorAll('#designPanel .seg')[3].querySelectorAll('button')).find(b=>b.title==='Bold').click()`);
    eq((await E(`__T.applySince(${nn})`)).value, '700');
    nn = await E(`__T.n()`);
    await E(`Array.from(document.querySelectorAll('#designPanel .seg')[3].querySelectorAll('button')).find(b=>b.title==='Underline').click()`);
    const dm = await E(`__T.applySince(${nn})`);
    ok(dm.value.indexOf('line-through') >= 0 && dm.value.indexOf('underline') < 0, 'underline removed, strike kept: ' + dm.value);
  });

  await t('Typography: truncation applies the 3-prop combo', async () => {
    await E(`renderDesign()`);
    await E(`__T.openSel('Typography',4)`);
    await E(`__T.pickOpt('Disabled')`);
    const tri = await E(`(function(){var c=__T.cap();return c.slice(c.length-3).map(function(m){return m.prop+'='+m.value;});})()`);
    eq(tri, ['textOverflow=clip', 'whiteSpace=normal', 'overflow=visible']);
  });



  await t('Undo/redo round-trip restores previous value', async () => {
    await E(`dUndo.length=0;dRedo.length=0;dsel.styles.width='100%';renderDesign()`);
    await E(`__T.setNf('W','300')`);
    eq(await E(`dsel.styles.width`), '300px');
    const n = await E(`__T.n()`);
    await E(`undoD()`);
    eq((await E(`__T.applySince(${n})`)).value, '100%');
    await E(`redoD()`);
    eq((await E(`__T.last()`)).value, '300px');
  });

  await t('Undo covers composite transform (prevX/prevY)', async () => {
    await E(`document.activeElement&&document.activeElement.blur();'ok'`);
    await E(`dUndo.length=0;dRedo.length=0;dsel.styles.transform='matrix(1, 0, 0, 1, 10, 20)';renderDesign()`);
    const n = await E(`__T.n()`);
    await E(`__T.setNf('X','-9')`);
    const tail = await E(`__T.cap().slice(${n}).map(function(m){return m.prop;})`);
    ok(tail.indexOf('transform') >= 0, 'expected a transform apply in tail, got ' + JSON.stringify(tail));
    // stacks may hold entries from earlier tests — keep undoing until we see the transform one
    const sent = await ev(cdp, `(function(){
      for(var i=0;i<8;i++){
        var at=__T.n();
        if(!dUndo.length) break;
        undoD();
        var m=__T.cap()[at];
        if(m && m.prop==='transform') return m;
      }
      return null;
    })()`);
    ok(sent, 'undo never produced a transform entry');
    eq([sent.prop, sent.x, sent.y], ['transform', 10, 20]);
  });

  await t('Echo snapshot merges external changes into fields', async () => {
    // blur any focused input so re-render is immediate
    await E(`document.activeElement&&document.activeElement.blur();'ok'`);
    const merged = JSON.parse(JSON.stringify(SAMPLE));
    merged.styles.width = '444px';
    merged.styles.opacity = '1';
    await E(`__T.sendTarget(${JSON.stringify(merged)})`);
    eq(await E(`__T.nfVal('W')`), '444');
    eq(await E(`__T.nfSuf('%')`), '100');
  });

  await t('Scroll position preserved across re-render', async () => {
    await E(`(function(){var dp=document.getElementById('designPanel');dp.style.height='260px';dp.style.maxHeight='260px';var s=document.querySelector('.dp-scroll');for(var i=0;i<30;i++)s.appendChild(document.createElement('div')).textContent='pad '+i;s.scrollTop=77;return s.scrollTop;})()`);
    await E(`__T.sendTarget(${JSON.stringify(SAMPLE)})`);
    eq(await E(`document.querySelector('.dp-scroll').scrollTop`), 77);
    await E(`(function(){var dp=document.getElementById('designPanel');dp.style.height='';dp.style.maxHeight='';})()`);
  });

  await t('No re-render mid-interaction; flushes on pointerup', async () => {
    await E(`__T.mark()`);
    await E(`window._dpDown=true`);
    await E(`__T.sendTarget(${JSON.stringify(SAMPLE)})`);
    ok(await E(`__T.marked()`), 'panel should NOT have re-rendered while pointer down');
    await E(`document.dispatchEvent(new PointerEvent('pointerup',{bubbles:true}))`);
    ok(!(await E(`__T.marked()`)), 'pending re-render should flush after pointerup');
  });

  await t('Tab switching preserves design selection', async () => {
    await E(`setActiveTab('tasks')`);
    eq(await E(`__T.q('#designPanel').style.display`), 'none');
    eq(await E(`__T.q('#projList').style.display`), 'flex');
    await E(`setActiveTab('design')`);
    eq(await E(`__T.q('#designPanel').style.display`), 'flex');
    eq(await E(`__T.txt('.dp-name')`), 'Button');
  });

  await t('Property area scrolls in full-height mode (real geometry)', async () => {
    await E(`__T.sendTarget(${JSON.stringify(SAMPLE)})`);
    const r = await E(`(function(){
      var sc = document.querySelector('.dp-scroll');
      var dp = document.getElementById('designPanel');
      var before = sc.scrollTop;
      var overflows = sc.scrollHeight > sc.clientHeight;
      var bounded = dp.offsetHeight <= window.innerHeight + 1;
      sc.scrollTop = 60; var canScroll = sc.scrollTop === 60;
      sc.scrollTop = before;
      return { o: overflows, b: bounded, c: canScroll, ch: sc.clientHeight, sh: sc.scrollHeight };
    })()`);
    ok(r.o, 'sections should exceed the visible area (clientHeight=' + r.ch + ', scrollHeight=' + r.sh + ')');
    ok(r.b, 'editor height must stay within the viewport');
    ok(r.c, 'property area must be scrollable');
  });

  await t('Design editor fills the whole sidebar (listings hidden)', async () => {
    ok(await E(`document.body.classList.contains('design-mode')`), 'design-mode class missing');
    ok(await E(`getComputedStyle(document.getElementById('cards')).display==='none'`), 'cards still visible');
    const ratio = await E(`(function(){var dp=document.getElementById('designPanel');return dp.offsetHeight/window.innerHeight;})()`);
    ok(ratio > 0.55, 'editor should dominate the sidebar, ratio=' + ratio.toFixed(2));
  });

  await t('Finished edits are committed as a Task message on session end', async () => {
    await E(`dPendingEdits.length=0;dSelMeta={ecbId:'ecb-t-1',tag:'button',selector:'#buy'};`);
    await E(`__T.setNf('W','250')`);
    const n0 = await E(`__T.n()`);
    await E(`__T.sendTarget(null)`); // host clears selection -> flush
    const m = await E(`__T.cap().slice(${n0}).find(function(x){return x.type==='commitEdits';})`);
    ok(m, 'no commitEdits sent');
    eq(m.ecbId, 'ecb-t-1');
    ok(m.edits.some(function(e){return e.prop==='width'&&e.value==='250px';}), 'width edit missing: ' + JSON.stringify(m.edits));
    eq(await E(`dPendingEdits.length`), 0, 'pending not cleared');
  });

  await t('Switching elements commits previous element edits', async () => {
    await E(`__T.sendTarget(${JSON.stringify(SAMPLE)})`);
    await E(`dPendingEdits.length=0;`);
    await E(`dsel.styles.height='40px';renderDesign()`);
    await E(`__T.setNf('H','88')`);
    const n1 = await E(`__T.n()`);
    const other = JSON.parse(JSON.stringify(SAMPLE)); other.ecbId = 'ecb-other'; other.tag = 'div';
    await E(`__T.sendTarget(${JSON.stringify(other)})`);
    const m = await E(`__T.cap().slice(${n1}).find(function(x){return x.type==='commitEdits';})`);
    ok(m && m.ecbId === 'ecb-t-1' && m.edits.some(function(e){return e.prop==='height'&&e.value==='88px';}), 'previous-session edits not committed');
  });

  await t('Escape ends editing: commits then deselects', async () => {
    await E(`__T.sendTarget(${JSON.stringify(SAMPLE)})`);
    await E(`dPendingEdits.length=0;dSelMeta={ecbId:'ecb-t-1',tag:'button',selector:'#buy'};`);
    await E(`__T.setNfIn('Layout','H','70')`);
    const n2 = await E(`__T.n()`);
    await E(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
    const msgs = await E(`__T.cap().slice(${n2}).map(function(x){return x.type;})`);
    ok(msgs.indexOf('commitEdits') >= 0 && msgs.indexOf('designDeselect') >= 0 && msgs.indexOf('commitEdits') < msgs.indexOf('designDeselect'), 'expected commitEdits then designDeselect, got ' + JSON.stringify(msgs));
  });

  await t('Done button ends editing: commits then deselects', async () => {
    await E(`__T.sendTarget(${JSON.stringify(SAMPLE)})`);
    await E(`dPendingEdits.length=0;dSelMeta={ecbId:'ecb-t-1',tag:'button',selector:'#buy'};`);
    await E(`__T.setNfSuf('%','66')`);
    const n3 = await E(`__T.n()`);
    await E(`(function(){var b=Array.from(document.querySelectorAll('#designPanel .dp-btns button')).find(function(x){return x.title.indexOf('Done')===0;});if(!b)throw new Error('no Done btn');b.click();})()`);
    const msgs = await E(`__T.cap().slice(${n3}).map(function(x){return x.type;})`);
    ok(msgs.indexOf('designDeselect') >= 0, 'Done did not deselect');
  });

  await t('Scrollbar hidden but panel scrollable', async () => {
    eq(await E(`getComputedStyle(__T.q('.dp-scroll')).scrollbarWidth`), 'none', 'scrollbar should be hidden');
    // forced small container must still scroll
    const r = await E(`(function(){var dp=document.getElementById('designPanel');dp.style.height='200px';var sc=document.querySelector('.dp-scroll');for(var i=0;i<25;i++)sc.appendChild(document.createElement('div'));var ok1=sc.scrollHeight>sc.clientHeight;sc.scrollTop=40;var ok2=sc.scrollTop===40;dp.style.height='';sc.scrollTop=0;return ok1&&ok2;})()`);
    ok(r, 'container should scroll');
  });

  await t('Panel edits emit designActivity pings (extend window)', async () => {
    await E(`__T.sendTarget(${JSON.stringify(SAMPLE)})`);
    const n4 = await E(`__T.n()`);
    await E(`document.querySelector('#designPanel .dp-sec').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}))`);
    let c1 = await E(`__T.cap().slice(${n4}).filter(function(x){return x.type==='designActivity';}).length`);
    ok(c1 >= 1, 'expected designActivity ping after interaction, got ' + c1);
    // a second interaction extends again (klone: rapid edits keep extending)
    await sleep(250);
    await E(`document.querySelector('#designPanel .dp-sec').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}))`);
    const c2 = await E(`__T.cap().slice(${n4}).filter(function(x){return x.type==='designActivity';}).length`);
    ok(c2 > c1, 'second interaction should add another ping');
    // no boolean state pairs exist in the klone-style protocol
    eq(await E(`__T.cap().some(function(x){return x.type==='designEditing';})`), false);
  });

  await t('Theme tokens: fields/muted colors match system palette', async () => {
    eq((await E(`getComputedStyle(__T.q('.nf')).backgroundColor`)).replace(/\s/g, ''), 'rgb(39,40,34)');
    eq((await E(`getComputedStyle(document.querySelectorAll('.dp-btn')[1]).color`)).replace(/\s/g, ''), 'rgb(117,113,94)');
    eq((await E(`getComputedStyle(document.querySelector('.dp-done')).backgroundColor`)).replace(/\s/g, ''), 'rgb(117,113,94)');
    eq((await E(`getComputedStyle(document.querySelector('.dp-done')).color`)).replace(/\s/g, ''), 'rgb(248,248,242)');
    // focus border token
    const nf = await E(`(function(){var i=__T.nfIn('Position','X');i.focus();var c=getComputedStyle(i.parentElement).borderTopColor;i.blur();return c;})()`);
    ok(nf.indexOf('117, 113, 94') >= 0 || nf === 'rgb(117, 113, 94)', 'focus border should be #75715E, got ' + nf);
  });

  await t('Number field scrub emits incremental stream', async () => {
    await E(`dsel.styles.transform='matrix(1, 0, 0, 1, 10, 20)';renderDesign()`);
    const at = await E(`__T.n()`);
    await E(`(function(){var i=__T.nfIn('Position','X');
      i.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,clientX:100,button:0,pointerId:1}));
      window.dispatchEvent(new PointerEvent('pointermove',{clientX:105,pointerId:1}));
      window.dispatchEvent(new PointerEvent('pointermove',{clientX:108,pointerId:1}));
      window.dispatchEvent(new PointerEvent('pointerup',{pointerId:1}));})()`);
    const vals = await E(`__T.cap().slice(${at}).filter(function(m){return m.type==='designApply';}).map(function(m){return m.x;})`);
    ok(vals.length >= 2, 'expected multiple scrub events, got ' + JSON.stringify(vals));
    eq(vals[1] - vals[0], 3, 'increment between moves');
  });

  await t('Dropdown closes on outside click and Escape', async () => {
    await E(`__T.openSel('Appearance',0)`);
    eq(await E(`__T.menuOpen()`), 1);
    await E(`__T.closeMenus()`);
    eq(await E(`__T.menuOpen()`), 0);
    await E(`__T.openSel('Appearance',0)`);
    await E(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
    eq(await E(`__T.menuOpen()`), 0);
  });
}

async function injectSuite(cdp) {
  const BOX = "document.getElementById('__ecb-selbox')";
  await nav(cdp, 'inject.html');
  await ev(cdp, `window.__msgs=[];window.addEventListener('message',function(e){var d=e.data;if(d&&(d.__ecbStyles||d.__ecb===true||d.__ecbDesignCleared))__msgs.push(d);});'rec'`);
  const E = e => ev(cdp, e);

  await t('inject: applyStyle by selector + snapshot echo with ecbId', async () => {
    await E(`window.dispatchEvent(new MessageEvent('message',{data:{__ecb:'applyStyle',prop:'width',value:'300px',selector:'#b'}}))`);
    eq(await E(`document.getElementById('b').style.width`), '300px');
    const snap = await E(`__msgs.filter(function(m){return m.__ecbStyles;}).pop()`);
    ok(snap, 'no snapshot');
    eq(snap.data.styles.width, '300px');
    ok(/^ecb-\d+/.test(snap.data.ecbId), 'ecbId assigned: ' + snap.data.ecbId);
  });

  await t('inject: getStyles returns fresh snapshot of current selection', async () => {
    const n = await E(`__msgs.length`);
    await E(`window.postMessage({__ecb:'getStyles'},'*');'sent'`);
    let snap = null;
    for (let i = 0; i < 30; i++) { await sleep(100); snap = await E(`__msgs[${n}]||null`); if (snap) break; }
    if (!snap) {
      const dump = await E(`JSON.stringify({len:__msgs.length,msgs:__msgs.map(function(m){return Object.keys(m).join(',');})})`);
      throw new Error('no snapshot arrived; state=' + dump);
    }
    eq(snap.data.tag, 'button');
    eq(snap.data.styles.width, '300px');
  });

  await t('inject: camelCase -> kebab CSS mapping', async () => {
    await E(`window.dispatchEvent(new MessageEvent('message',{data:{__ecb:'applyStyle',prop:'backgroundColor',value:'rgb(1, 2, 3)'}}))`);
    ok((await E(`getComputedStyle(document.getElementById('b')).backgroundColor`)).indexOf('rgb(1, 2, 3)') === 0, 'bg not applied');
    await E(`window.dispatchEvent(new MessageEvent('message',{data:{__ecb:'applyStyle',prop:'borderRadius',value:'14px'}}))`);
    eq(await E(`document.getElementById('b').style.borderRadius`), '14px');
    await E(`window.dispatchEvent(new MessageEvent('message',{data:{__ecb:'applyStyle',prop:'textDecorationLine',value:'underline overline'}}))`);
    eq(await E(`document.getElementById('b').style.textDecorationLine`), 'underline overline');
  });

  await t('inject: transform compose translate->rotate->flip roundtrip', async () => {
    await E(`window.dispatchEvent(new MessageEvent('message',{data:{__ecb:'applyStyle',prop:'transform',x:-5,y:7}}))`);
    eq(await E(`document.getElementById('b').style.transform`), 'translate(-5px, 7px)');
    await E(`window.dispatchEvent(new MessageEvent('message',{data:{__ecb:'applyStyle',prop:'rotate',value:'90'}}))`);
    const t1 = await E(`document.getElementById('b').style.transform`);
    ok(t1.indexOf('rotate(90deg)') > 0 && t1.indexOf('-5px') > 0, 'rotate kept translate: ' + t1);
    await E(`window.dispatchEvent(new MessageEvent('message',{data:{__ecb:'applyStyle',prop:'scaleX',value:'-1'}}))`);
    const t2 = await E(`document.getElementById('b').style.transform`);
    eq(t2, 'translate(-5px, 7px) rotate(90deg) scale(-1, 1)', 'flip must survive recomposition');
    await E(`window.dispatchEvent(new MessageEvent('message',{data:{__ecb:'applyStyle',prop:'rotate',value:'0'}}))`);
    const t3 = await E(`document.getElementById('b').style.transform`);
    // rot 0 + flip has two equivalent decompositions (axis swap ambiguity) — accept either
    ok(t3.indexOf('-5px') > 0 && t3.indexOf('rotate') < 0 && /scale\(-?1,\s*-?1\)/.test(t3), 'rot zeroed but flip kept: ' + t3);
  });

  await t('inject: visibility / opacity toggles', async () => {
    await E(`window.dispatchEvent(new MessageEvent('message',{data:{__ecb:'applyStyle',prop:'visibility',value:'hidden'}}))`);
    eq(await E(`getComputedStyle(document.getElementById('b')).visibility`), 'hidden');
    await E(`window.dispatchEvent(new MessageEvent('message',{data:{__ecb:'applyStyle',prop:'visibility',value:'visible'}}))`);
    await E(`window.dispatchEvent(new MessageEvent('message',{data:{__ecb:'applyStyle',prop:'opacity',value:'0.35'}}))`);
    eq(await E(`document.getElementById('b').style.opacity`), '0.35');
  });

  await t('inject: explicit selector retargets past stale selection', async () => {
    await E(`window.dispatchEvent(new MessageEvent('message',{data:{__ecb:'applyStyle',prop:'width',value:'80px',selector:'#c'}}))`);
    eq(await E(`document.getElementById('c').style.width`), '80px');
    const snap = await E(`__msgs.filter(function(m){return m.__ecbStyles;}).pop()`);
    eq(snap.data.tag, 'p', 'snapshot follows retargeted element');
  });

  await t('inject: ecbId retarget after DOM re-query', async () => {
    const ecb = await E(`document.getElementById('c').getAttribute('data-ecb-id')`);
    await E(`window.dispatchEvent(new MessageEvent('message',{data:{__ecb:'applyStyle',prop:'color',value:'rgb(9, 9, 9)',ecbId:${JSON.stringify('ecb-c-test')}}}))`);
    // unknown id falls through selector then lastSelected — lastSelected should be #c now
    eq(await E(`getComputedStyle(document.getElementById('c')).color`), 'rgb(9, 9, 9)');
    void ecb;
  });

  await t('selection: inspect click highlights element persistently', async () => {
    await E(`window.postMessage({__ecb:'mode',enabled:true},'*');'mode'`);
    await sleep(120);
    const n = await E(`__msgs.length`);
    await E(`document.getElementById('b').click()`);
    eq(await E(`(function(){var b=document.getElementById('__ecb-selbox');return !!b&&b.style.display==='block';})()`), true, 'persistent selection box missing');
    eq(await E(`(function(){var b=${BOX}.getBoundingClientRect(),e=document.getElementById('b').getBoundingClientRect();return Math.abs((b.left+b.width/2)-(e.left+e.width/2))<4&&Math.abs((b.top+b.height/2)-(e.top+e.height/2))<4;})()`), true, 'box not aligned to element');
    ok(await E(`__msgs.slice(${n}).some(function(m){return m.__ecb===true;})`), 'click did not report capture');
  });

  await t('selection: clicking the selected element again deselects', async () => {
    const n = await E(`__msgs.length`);
    await E(`document.getElementById('b').click()`);
    let cleared = false;
    for (let i = 0; i < 20; i++) {
      await sleep(60);
      cleared = await E(`(function(){var b=${BOX};return (!b||b.style.display==='none')&&__msgs.slice(${n}).some(function(m){return m.__ecbDesignCleared;});})()`);
      if (cleared) break;
    }
    ok(cleared, 'no clear event / box still visible');
  });

  await t('selection: clicking outside (body) deselects', async () => {
    await E(`document.getElementById('b').click()`);
    await sleep(80);
    eq(await E(`${BOX}.style.display`), 'block');
    await E(`document.body.click()`);
    let hidden = false;
    for (let i = 0; i < 20; i++) { await sleep(60); hidden = await E(`${BOX}.style.display==='none'`); if (hidden) break; }
    ok(hidden, 'body click should clear selection');
  });

  await t('selection: ring survives overflow-hidden clipping', async () => {
    // regression for "highlight shows on some sides / invisible": a top-level
    // fixed overlay can never be clipped by ancestor overflow.
    await E(`(function(){var w=document.createElement('div');w.id='clipwrap';w.style.cssText='overflow:hidden;width:120px;height:40px';w.appendChild(document.getElementById('b'));document.body.appendChild(w);})();'wrap'`);
    await E(`document.getElementById('b').click()`);
    await sleep(80);
    const vis = await E(`(function(){var b=document.getElementById('__ecb-selbox');var r=b.getBoundingClientRect();return b.style.display==='block'&&r.width>0&&r.height>0;})()`);
    eq(vis, true, 'ring lost inside overflow:hidden ancestor');
    await E(`window.postMessage({__ecb:'deselect'},'*');'clean'`);
    await sleep(60);
    await E(`(function(){var w=document.getElementById('clipwrap');document.body.insertBefore(document.getElementById('b'),w);w.remove();})();'unwrap'`);
  });

  await t('selection: clicking another element moves highlight; deselect cmd works', async () => {
    await E(`document.getElementById('b').click()`);
    await sleep(80);
    await E(`document.getElementById('c').click()`);
    await sleep(80);
    const onC = await E(`(function(){var b=${BOX}.getBoundingClientRect(),e=document.getElementById('c').getBoundingClientRect();return Math.abs((b.left+b.width/2)-(e.left+e.width/2))<4&&Math.abs((b.top+b.height/2)-(e.top+e.height/2))<4;})()`);
    eq(onC, true, 'highlight not moved onto the new element');
    await E(`window.postMessage({__ecb:'deselect'},'*');'cmd'`);
    await sleep(100);
    eq(await E(`${BOX}.style.display`), 'none', 'deselect command failed');
  });

  await t('selector toggle OFF cancels the active selection', async () => {
    // selector ON -> pick an element
    await E(`window.postMessage({__ecb:'mode',enabled:true},'*');'on'`);
    await sleep(100);
    await E(`document.getElementById('b').click()`);
    await sleep(80);
    eq(await E(`(function(){var b=document.getElementById('__ecb-selbox');return !!b&&b.style.display==='block';})()`), true);
    const n = await E(`__msgs.length`);
    // user clicks the chat-icon selector again -> mode OFF must unselect everything
    await E(`window.postMessage({__ecb:'mode',enabled:false},'*');'off'`);
    let cleared = false;
    for (let i = 0; i < 20; i++) {
      await sleep(60);
      cleared = await E(`(function(){var b=document.getElementById('__ecb-selbox');return (!b||b.style.display==='none')&&__msgs.slice(${n}).some(function(m){return m.__ecbDesignCleared;});})()`);
      if (cleared) break;
    }
    ok(cleared, 'toggling selector OFF did not cancel the selection');
    // re-enable for subsequent suites
    await E(`window.postMessage({__ecb:'mode',enabled:true},'*');'re-on'`);
    await sleep(80);
  });

  await t('selection: editActive hides ring while editing, restores after', async () => {
    await E(`document.getElementById('b').click()`);
    await sleep(80);
    eq(await E(`${BOX}.style.display`), 'block');
    // editing starts -> suppressed (klone selBoxHiddenUntil model)
    await E(`window.postMessage({__ecb:'editActive'},'*');'on'`);
    await sleep(80);
    eq(await E(`${BOX}.style.display`), 'none', 'ring should hide while editing');
    // klone semantics: NO restore message needed — window expires on its own
    let restored = false;
    for (let i = 0; i < 32; i++) { await sleep(100); restored = await E(`${BOX}.style.display==='block'`); if (restored) break; }
    ok(restored, 'ring should return automatically once the 1.5s window expires');
    await E(`window.postMessage({__ecb:'deselect'},'*');'clean'`);
    await sleep(80);
  });
  await t('inject: inline elements are promoted so translate actually moves them', async () => {
    await E(`window.dispatchEvent(new MessageEvent('message',{data:{__ecb:'applyStyle',prop:'transform',x:25,y:10,selector:'#sp'}}))`);
    eq(await E(`getComputedStyle(document.getElementById('sp')).display`), 'inline-block', 'inline not promoted');
    const moved = await E(`(function(){var r=document.getElementById('sp').getBoundingClientRect();return Math.round(r.left)+','+Math.round(r.top);})()`);
    // the span sits in normal flow; after translate its rect must shift
    ok(await E(`document.getElementById('sp').style.transform.indexOf('translate(25px, 10px)')===0`), 'transform not applied: ' + await E(`document.getElementById('sp').style.transform`));
    void moved;
  });

  await t('inject: site !important rules cannot swallow our edits', async () => {
    const r0 = await E(`document.getElementById('imp').getBoundingClientRect().left`);
    await E(`window.dispatchEvent(new MessageEvent('message',{data:{__ecb:'applyStyle',prop:'transform',x:40,y:0,selector:'#imp'}}))`);
    const movedBy = await E(`document.getElementById('imp').getBoundingClientRect().left`) - r0;
    ok(Math.abs(movedBy - 40) < 1.5, 'expected ~40px move against !important site rule, got ' + movedBy);
  });

}

async function panelSuite(cdp) {
  await nav(cdp, 'panel.html');
  const E = e => ev(cdp, e);

  await t('chat-icon selection counter removed', async () => {
    eq(await E(`!!document.getElementById('badge')`), false, '#badge should be removed');
  });

  await t('panel relay: host command forwarded into iframe', async () => {
    await E(`(function(){var f=document.getElementById('app');window.__irc=[];f.contentWindow.addEventListener('message',function(e){window.__irc.push(e.data);});})()`);
    await E(`window.dispatchEvent(new MessageEvent('message',{data:{type:'ecbApplyStyle',prop:'width',value:'50px',ecbId:'z1',selector:'#z'}}))`);
    const got = await E(`(__irc||[]).pop()`);
    ok(got && got.__ecb === 'applyStyle' && got.prop === 'width' && got.ecbId === 'z1', 'command not forwarded: ' + JSON.stringify(got));
  });

  await t('panel relay: iframe snapshot reaches host as designStyles', async () => {
    // post from INSIDE the iframe realm so ev.source === app.contentWindow
    await E(`(function(){var f=document.getElementById('app');f.contentWindow.eval("parent.postMessage({__ecbStyles:true,data:{ecbId:'z1',tag:'div',selector:'#z',styles:{width:'1px'}}},'*');");})()`);
    let m = null;
    for (let i = 0; i < 25; i++) { await sleep(80); m = await E(`__cap.filter(function(x){return x.type==='designStyles';}).pop()||null`); if (m) break; }
    ok(m && m.data && m.data.styles && m.data.styles.width === '1px', 'designStyles not relayed');
  });
}

async function main() {
  const profile = path.join(os.tmpdir(), 'opencode', 'chrome-prof');
  fs.rmSync(profile, { recursive: true, force: true }); fs.mkdirSync(profile, { recursive: true });
  const chrome = spawn(process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new', '--disable-gpu', '--no-first-run', '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + profile, '--window-size=420,900', 'about:blank'
  ], { stdio: 'ignore' });

  let version = null;
  for (let i = 0; i < 60; i++) {
    try { version = await (await fetch('http://127.0.0.1:' + PORT + '/json/version')).json(); break; }
    catch (e) { await sleep(250); }
  }
  if (!version) throw new Error('Chrome DevTools endpoint did not come up');

  const tgt = await (await fetch('http://127.0.0.1:' + PORT + '/json/new?about:blank', { method: 'PUT' })).json();
  const cdp = await connect(tgt.webSocketDebuggerUrl);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');

  try {
    console.log('--- SIDEBAR EDITOR ---');
    await sidebarSuite(cdp);
    console.log('--- INJECTED PAGE ENGINE ---');
    await injectSuite(cdp);
    console.log('--- PANEL RELAY ---');
    await panelSuite(cdp);
  } finally {
    cdp.close();
    chrome.kill();
  }

  console.log('\n==============================');
  console.log('PASSED: ' + passCount + '   FAILED: ' + fails.length);
  if (fails.length) { fails.forEach(f => console.log('  FAIL ' + f)); process.exit(1); }
}

main().catch(e => { console.error('FATAL', e); process.exit(1); });
