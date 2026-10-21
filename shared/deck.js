// Tiny slide engine. Keys:  → / Space next · ← back · P presenter window · T start/pause lecture clock
// O overview · F fullscreen · R reset countdown on the current slide · click a diagram to zoom
(() => {
  const slides = [...document.querySelectorAll('.slide')]
  const params = new URLSearchParams(location.search)
  const isPresenter = params.has('presenter')
  const channel = new BroadcastChannel('deck:' + location.pathname)
  const total = slides.length
  const lectureMinutes = Number(document.body.dataset.minutes || 45)
  let i = Math.min(Math.max(parseInt(location.hash.slice(1)) - 1 || 0, 0), total - 1)

  // Lecture clock is shared between audience + presenter windows via localStorage
  const clockKey = 'deck-clock:' + location.pathname
  const readClock = () => JSON.parse(localStorage.getItem(clockKey) || '{"start":null,"paused":0,"pausedAt":null}')
  const writeClock = (c) => { localStorage.setItem(clockKey, JSON.stringify(c)); channel.postMessage({ type: 'clock' }) }
  const elapsedMs = () => {
    const c = readClock()
    if (!c.start) return 0
    return (c.pausedAt || Date.now()) - c.start - c.paused
  }
  const toggleClock = () => {
    const c = readClock()
    if (!c.start) c.start = Date.now()
    else if (c.pausedAt) { c.paused += Date.now() - c.pausedAt; c.pausedAt = null }
    else c.pausedAt = Date.now()
    writeClock(c)
  }
  const fmt = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0') }

  const segOf = (s) => s.dataset.seg || ''
  const targetMin = (s) => Number(s.dataset.at || 0)
  const titleOf = (s) => (s.querySelector('h1,h2,.q,h3')?.textContent || s.querySelector('img')?.alt || s.dataset.title || '').trim().slice(0, 90)
  const notesOf = (s) => s.querySelector('.notes')?.innerHTML || '<p class="muted">No notes for this slide.</p>'

  if (isPresenter) return presenter()

  // ---------- Audience view ----------
  const stage = document.querySelector('.stage')
  const fit = () => {
    const k = Math.min(innerWidth / 1600, innerHeight / 900)
    stage.style.transform = `translate(-50%, -50%) scale(${k})`
  }
  addEventListener('resize', fit); fit()

  slides.forEach((s, n) => {
    if (segOf(s)) { const d = document.createElement('div'); d.className = 'seg'; d.innerHTML = `<b>${segOf(s)}</b>${s.dataset.at ? ' · ~' + s.dataset.at + ' min' : ''}`; s.prepend(d) }
    const p = document.createElement('div'); p.className = 'pageno'; p.textContent = `${n + 1} / ${total}`; s.append(p)
    const bar = document.createElement('div'); bar.className = 'progress'; bar.style.width = ((n + 1) / total * 100) + '%'; s.append(bar)
  })

  const zoom = document.createElement('div'); zoom.className = 'zoom'; zoom.innerHTML = '<img alt="">'; document.body.append(zoom)
  zoom.onclick = () => zoom.classList.remove('on')
  document.querySelectorAll('.slide.diagram img').forEach((img) => img.addEventListener('click', () => {
    zoom.querySelector('img').src = img.src; zoom.querySelector('img').alt = img.alt; zoom.classList.add('on')
  }))

  const ov = document.createElement('div'); ov.className = 'overview'; document.body.append(ov)
  const buildOverview = () => {
    ov.innerHTML = ''
    slides.forEach((s, n) => {
      const b = document.createElement('button'); b.className = n === i ? 'cur' : ''
      b.innerHTML = `<span>${n + 1} · ${segOf(s)}</span>${titleOf(s)}`
      b.onclick = () => { ov.classList.remove('on'); go(n) }
      ov.append(b)
    })
  }

  const help = document.createElement('div'); help.className = 'help'
  help.textContent = '→ next · ← back · P presenter notes · T clock · O overview · F fullscreen'
  document.body.append(help); setTimeout(() => help.remove(), 6000)

  function go(n, fromRemote) {
    i = Math.min(Math.max(n, 0), total - 1)
    slides.forEach((s, k) => s.classList.toggle('active', k === i))
    history.replaceState(null, '', '#' + (i + 1))
    if (!fromRemote) channel.postMessage({ type: 'go', i })
  }
  channel.onmessage = (e) => {
    if (e.data.type === 'go' && e.data.i !== i) go(e.data.i, true)
    if (e.data.type === 'hello') channel.postMessage({ type: 'go', i }) // presenter window just opened
  }

  addEventListener('keydown', (e) => {
    if (e.target.closest('input, textarea, select')) return
    const k = e.key
    if (['ArrowRight', 'PageDown', ' ', 'Enter'].includes(k)) { e.preventDefault(); go(i + 1) }
    else if (['ArrowLeft', 'PageUp', 'Backspace'].includes(k)) { e.preventDefault(); go(i - 1) }
    else if (k === 'Home') go(0)
    else if (k === 'End') go(total - 1)
    else if (k === 'p' || k === 'P') window.open(location.pathname + '?presenter', 'presenter', 'width=1200,height=800')
    else if (k === 't' || k === 'T') toggleClock()
    else if (k === 'o' || k === 'O') { buildOverview(); ov.classList.toggle('on') }
    else if (k === 'f' || k === 'F') document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()
    else if (k === 'Escape') { zoom.classList.remove('on'); ov.classList.remove('on') }
    else if (k === 'r' || k === 'R') slides[i].querySelectorAll('.countdown').forEach((c) => c.reset())
  })

  // Countdown timers for activities: <div class="countdown" data-sec="600"></div>
  document.querySelectorAll('.countdown').forEach((el) => {
    const total = Number(el.dataset.sec || 300)
    let left = total, tick = null
    const draw = () => { el.firstChild ? (el.firstChild.nodeValue = fmt(left * 1000)) : el.append(fmt(left * 1000)) }
    el.reset = () => { clearInterval(tick); tick = null; left = total; el.className = 'countdown'; draw() }
    el.onclick = () => {
      if (tick) { clearInterval(tick); tick = null; el.classList.remove('running'); return }
      if (left <= 0) return el.reset()
      el.classList.add('running')
      tick = setInterval(() => { left--; draw(); if (left <= 0) { clearInterval(tick); tick = null; el.className = 'countdown done' } }, 1000)
    }
    draw()
  })

  go(i)

  // ---------- Presenter view ----------
  function presenter() {
    document.body.className = 'presenter'
    document.querySelector('.stage')?.remove()
    document.body.insertAdjacentHTML('beforeend', `
      <div class="pv">
        <div><div class="segname"></div><div class="now"></div><div class="notesbox"></div></div>
        <div class="side">
          <div><div class="meta">LECTURE CLOCK (T to start/pause)</div><div class="clock">0:00</div><div class="meta target"></div></div>
          <div class="next"></div>
          <button id="prev">← Back</button><button id="nextb" style="background:#2552c9;color:#fff">Next →</button>
          <button id="clockb">Start / pause clock</button><button id="resetb">Reset clock</button>
        </div>
      </div>`)
    const $ = (s) => document.querySelector(s)
    const draw = () => {
      const s = slides[i], nx = slides[i + 1]
      $('.segname').textContent = `${i + 1} / ${total} · ${segOf(s)}`
      $('.now').textContent = titleOf(s)
      $('.notesbox').innerHTML = notesOf(s)
      $('.next').innerHTML = nx ? `<span class="meta">NEXT</span><br>${titleOf(nx)}` : '<span class="meta">END OF DECK</span>'
      $('.target').textContent = `target: be on this slide by ~${targetMin(s)} min of ${lectureMinutes}`
      document.title = `Notes · ${i + 1}/${total}`
    }
    const tickClock = () => {
      const m = elapsedMs() / 60000, c = $('.clock')
      c.textContent = fmt(elapsedMs())
      c.className = 'clock ' + (m > targetMin(slides[i]) + 3 ? 'late' : 'ok')
    }
    const go2 = (n) => { i = Math.min(Math.max(n, 0), total - 1); channel.postMessage({ type: 'go', i }); draw() }
    channel.onmessage = (e) => { if (e.data.type === 'go') { i = e.data.i; draw() } }
    $('#prev').onclick = () => go2(i - 1); $('#nextb').onclick = () => go2(i + 1)
    $('#clockb').onclick = toggleClock
    $('#resetb').onclick = () => writeClock({ start: null, paused: 0, pausedAt: null })
    addEventListener('keydown', (e) => {
      if (['ArrowRight', ' ', 'PageDown'].includes(e.key)) { e.preventDefault(); go2(i + 1) }
      if (['ArrowLeft', 'PageUp'].includes(e.key)) { e.preventDefault(); go2(i - 1) }
      if (e.key === 't' || e.key === 'T') toggleClock()
    })
    setInterval(tickClock, 500); draw(); tickClock()
    channel.postMessage({ type: 'hello' })
  }
})()
