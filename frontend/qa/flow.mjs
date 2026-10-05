// Browser flow test with a fake camera/mic and a scripted server (no API key, no backend).
// Covers: start, streaming, tap-to-fix validation, engine rejections, typed input, a dropped
// connection restoring the hand, hand history, screen-off mode, ending, and refused connections.
//
//   npm run build && npm run preview &        # serves http://localhost:4173
//   npm i --no-save playwright && npx playwright install chromium
//   node qa/flow.mjs ./qa-shots               # prints PASS/FAIL per check, saves screenshots
//
import fs from 'fs';
import { chromium } from 'playwright';
const URL = process.env.APP_URL || 'http://localhost:4173/';
const S = process.argv[2] || '.';
fs.mkdirSync(S, { recursive: true });
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
const out = []; const ok = (name, cond, extra = '') => out.push(`${cond ? 'PASS' : 'FAIL'}  ${name} ${extra}`);
const state0 = { hand_number: 1, hero_cards: [], board_cards: [], street: 'preflop', pot: 0, to_call: 0, opponents: 1, hero_folded: false, recent_actions: [], history: [] };

async function run(vp, tag) {
  const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: 2, permissions: ['camera', 'microphone'] });
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.route('**/health', (r) => r.fulfill({ json: { status: 'ok', live_ready: true }, headers: { 'access-control-allow-origin': '*' } }));
  const conns = []; let st = { ...state0 };
  await p.routeWebSocket(/ws\/live/, (ws) => {
    const c = { url: ws.url(), got: [], ws }; conns.push(c);
    const send = (o) => ws.send(JSON.stringify(o));
    const push = () => { send({ type: 'state', state: st }); send({ type: 'facts', facts: st.hero_cards.length === 2 ? { ok: true, equity_pct: 31.2, required_equity_pct: 40, to_call: st.to_call, pot: st.pot, made_hand: 'High Card', verdict_hint: 'Fold: equity is below the price you\'re being laid.', outs: { count: 6, approx_hit_pct: 24 } } : null }); };
    c.send = send; c.push = push;
    send({ type: 'status', status: 'connecting' });
    setTimeout(() => { send({ type: 'status', status: 'live' }); push(); }, 300);
    ws.onMessage((m) => {
      const j = JSON.parse(m); if (j.type !== 'audio' && j.type !== 'video' && j.type !== 'ping') c.got.push(j); if (j.type === 'video') c.video = (c.video || 0) + 1; if (j.type === 'audio') c.audio = (c.audio || 0) + 1;
      if (j.type === 'restore') { st = { ...state0, ...j.state }; push(); }
      if (j.type === 'set') { st = { ...st, [j.field]: j.value }; send({ type: 'tool', name: 'x', ok: true }); push(); }
      if (j.type === 'new_hand') { st = { ...state0, hand_number: st.hand_number + 1, history: [...st.history, { hand: st.hand_number, hero_cards: st.hero_cards, board_cards: st.board_cards, reached: 'flop', pot: st.pot, hero_folded: false }] }; push(); }
      if (j.type === 'text') { send({ type: 'transcript', role: 'coach', text: 'Got your note.' }); send({ type: 'turn_complete' }); }
      if (j.type === 'advise') { send({ type: 'tool', name: 'get_decision_facts', args: {}, ok: true, ms: 34.2 }); send({ type: 'audio', data: 'AAAAAAAAAAAAAAAA', rate: 24000 }); send({ type: 'transcript', role: 'coach', text: 'Fold. Thirty-one percent, you need forty.' }); send({ type: 'turn_complete' }); }
    });
  });
  await p.goto(URL);
  await p.waitForTimeout(800);
  ok(tag + ' server status ready', await p.getByText('Coach server is ready').count() === 1);
  await p.screenshot({ path: `${S}/${tag}-landing.png`, fullPage: true });
  await p.getByText('Start session').click();
  await p.waitForTimeout(2600);
  ok(tag + ' video attached', await p.evaluate(() => { const v = document.querySelector('video'); return !!(v && v.srcObject && v.videoWidth > 0); }));
  ok(tag + ' frames + audio streaming', conns[0].video > 0 && conns[0].audio > 5, `(v=${conns[0].video} a=${conns[0].audio})`);
  await p.getByLabel('Edit your cards').first().click();
  await p.getByRole('button', { name: 'A', exact: true }).click(); await p.getByRole('button', { name: '♥' }).click();
  ok(tag + ' picker blocks 1 card', await p.getByRole('button', { name: 'Pick 2 cards' }).isDisabled());
  await p.getByRole('button', { name: 'K', exact: true }).click(); await p.getByRole('button', { name: '♥' }).click();
  await p.getByText('Save cards').click();
  conns[0].send({ type: 'tool', name: 'set_board', args: { cards: ['Qh', '7h', '2c'] }, ok: true, ms: 0.3 }); st = { ...st, board_cards: ['Qh', '7h', '2c'], street: 'flop', pot: 600, to_call: 400 }; conns[0].push();
  conns[0].send({ type: 'tool', name: 'set_board', args: { cards: ['Qh', 'Qh'] }, ok: false, error: 'Duplicate cards on the board. Re-read.', ms: 0.1 });
  await p.waitForTimeout(500);
  ok(tag + ' verdict shows Fold', await p.getByText('Fold', { exact: true }).count() >= 1);
  await p.getByRole('button', { name: /What should I do/ }).click();
  await p.waitForTimeout(500);
  await p.screenshot({ path: `${S}/${tag}-session.png`, fullPage: tag === 'm' });
  await p.getByRole('tab', { name: /Under the hood/ }).click(); await p.waitForTimeout(300);
  ok(tag + ' rejected call visible', await p.getByText('rejected by the engine').count() === 1);
  await p.screenshot({ path: `${S}/${tag}-hood.png`, fullPage: tag === 'm' });
  await p.getByRole('tab', { name: /Conversation/ }).click();
  await p.getByLabel('Type a message to the coach').fill('He always bluffs the river'); await p.keyboard.press('Enter'); await p.waitForTimeout(300);
  ok(tag + ' typed text sent', conns[0].got.some((g) => g.type === 'text'));
  conns[0].ws.close({ code: 1011 });
  await p.waitForTimeout(500);
  ok(tag + ' shows reconnecting', await p.getByText('Your hand is saved and will be put back.').count() === 1);
  await p.screenshot({ path: `${S}/${tag}-reconnect.png` });
  await p.waitForTimeout(2200);
  const c2 = conns[1];
  ok(tag + ' reconnected with resume', !!c2 && c2.url.includes('resume=1'));
  const rs = c2 && c2.got.find((g) => g.type === 'restore');
  ok(tag + ' hand restored', !!rs && rs.state.hero_cards.join() === 'Ah,Kh' && rs.state.board_cards.length === 3 && rs.state.pot === 600);
  ok(tag + ' back to live UI', await p.getByText('Live', { exact: true }).count() >= 1 && await p.getByText('Fold', { exact: true }).count() >= 1);
  await p.getByRole('button', { name: 'New hand' }).click(); await p.waitForTimeout(300);
  await p.getByRole('tab', { name: /Earlier hands/ }).click(); await p.waitForTimeout(300);
  ok(tag + ' history lists hand', await p.getByText('#1', { exact: true }).count() >= 1);
  await p.screenshot({ path: `${S}/${tag}-hands.png`, fullPage: tag === 'm' });
  await p.getByTitle('Dim the screen and run by ear').click(); await p.waitForTimeout(300);
  const before = conns[1].got.filter((g) => g.type === 'advise').length;
  await p.getByRole('dialog', { name: 'Screen-off mode' }).getByRole('button', { name: /Tap anywhere/ }).click(); await p.waitForTimeout(300);
  ok(tag + ' ear mode tap asks', conns[1].got.filter((g) => g.type === 'advise').length === before + 1);
  await p.screenshot({ path: `${S}/${tag}-ear.png` });
  await p.getByText('Show screen').click();
  await p.getByRole('button', { name: 'End', exact: true }).click();
  ok(tag + ' end asks to confirm', await p.getByText('Tap again to end').count() === 1);
  await p.getByText('Tap again to end').click(); await p.waitForTimeout(300);
  ok(tag + ' ended to landing', await p.getByText('Start session').count() === 1);
  ok(tag + ' camera released', await p.evaluate(() => !document.querySelector('video')));
  ok(tag + ' no page errors', errs.length === 0, errs.join(' | '));
  ok(tag + ' no h-overflow', await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth) === 0);
  await ctx.close();
}
await run({ width: 390, height: 844 }, 'm');
await run({ width: 1366, height: 820 }, 'd');

{
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, permissions: ['microphone'] });
  const p = await ctx.newPage();
  await p.route('**/health', (r) => r.fulfill({ json: { status: 'ok', live_ready: false }, headers: { 'access-control-allow-origin': '*' } }));
  await p.routeWebSocket(/ws\/live/, (ws) => ws.close({ code: 1008, reason: 'origin not allowed' }));
  await p.goto(URL); await p.waitForTimeout(700);
  ok('no-key status shown', await p.getByText(/no AI key set/).count() === 1);
  await p.getByText('Start session').click(); await p.waitForTimeout(2500);
  ok('refused -> landing with reason', await p.getByText(/refused the connection/).count() === 1 && await p.getByText('Try again').count() === 1);
  await ctx.close();
}
console.log(out.join('\n'));
await b.close();
if (out.some((l) => l.startsWith('FAIL'))) process.exit(1);
