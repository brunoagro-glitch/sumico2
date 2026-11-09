/* Sumiço · camada de movimento (versão de teste em /animado).
   Não muda conteúdo nem formulários: só adiciona entrada no scroll, reações ao mouse e o fantasminha.
   Quem pediu menos movimento no sistema vê a página parada. */
(function () {
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var fine = window.matchMedia && matchMedia('(hover: hover) and (pointer: fine)').matches;
  var root = document.documentElement;
  if (!reduce) root.classList.add('anim');
  function $$(sel, ctx) { return [].slice.call((ctx || document).querySelectorAll(sel)); }

  /* ---------- Fantasminha + barra de leitura ---------- */
  var bar = document.createElement('div'); bar.className = 'scroll-bar'; bar.setAttribute('aria-hidden', 'true');
  document.body.appendChild(bar);

  var ghost = document.createElement('button');
  ghost.type = 'button'; ghost.className = 'ghost'; ghost.setAttribute('aria-label', 'Fazer a varredura grátis');
  ghost.innerHTML =
    '<span class="ghost-tip">Quer ver onde você aparece?</span>' +
    '<svg viewBox="0 0 64 76" aria-hidden="true">' +
      '<defs><linearGradient id="g-grad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e9f2f4"/><stop offset="1" stop-color="#b9cfd3" stop-opacity=".85"/></linearGradient></defs>' +
      '<path class="g-body g-hem" fill="url(#g-grad)" d="M32 3C17 3 8 15 8 30v39l6-6 6 7 6-7 6 7 6-7 6 7 6-7 6 6V30C56 15 47 3 32 3z"/>' +
      '<g class="g-eyes"><g class="g-pupils"><rect class="g-eye" x="20" y="25" width="6" height="12" rx="3"/><rect class="g-eye" x="38" y="25" width="6" height="12" rx="3"/></g></g>' +
    '</svg><span class="ghost-shadow"></span>';
  document.body.appendChild(ghost);
  ghost.addEventListener('click', function () {
    var b = document.querySelector('[data-scan]'); if (b) b.click();
  });
  // os olhos seguem o mouse
  var pupils = ghost.querySelector('.g-pupils');
  if (fine && !reduce) document.addEventListener('mousemove', function (e) {
    var r = ghost.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height * .4;
    var dx = e.clientX - cx, dy = e.clientY - cy, d = Math.max(1, Math.hypot(dx, dy));
    pupils.setAttribute('transform', 'translate(' + (dx / d * 2.6).toFixed(2) + ' ' + (dy / d * 2.2).toFixed(2) + ')');
  }, { passive: true });
  // de vez em quando ele "some" e volta (é o Sumiço)
  if (!reduce) setInterval(function () {
    if (ghost.matches(':hover')) return;
    ghost.classList.add('fade'); setTimeout(function () { ghost.classList.remove('fade'); }, 1600);
  }, 9000);
  // depois de rolar um pouco, ele fala uma vez
  var talked = false;

  /* ---------- Entrada no scroll ---------- */
  function mark(sel, opts) {
    $$(sel).forEach(function (el, i) {
      if (el.classList.contains('rv')) return;
      el.classList.add('rv'); if (opts && opts.cls) el.classList.add(opts.cls);
      var step = opts && opts.step != null ? opts.step : .08;
      var idx = opts && opts.group ? [].indexOf.call(el.parentNode.children, el) : 0;
      el.style.setProperty('--d', (idx * step).toFixed(2) + 's');
    });
  }
  if (!reduce) {
    mark('.sec-head h2'); mark('.sec-head p', { step: 0 });
    $$('.sec-head p').forEach(function (p) { p.style.setProperty('--d', '.12s'); });
    mark('.clip', { group: true, step: .12 });
    mark('.wh', { group: true, step: .06 });
    mark('.sources .eyebrow'); mark('.wh-hint');
    mark('.stat', { group: true, step: .12 }); mark('.fonte');
    mark('.cmp-card'); mark('.cmp-note');
    mark('.step', { group: true, step: .14 });
    mark('.feat', { group: true, step: .07 });
    mark('.plan', { group: true, step: .1 });
    mark('.bf-box'); mark('.term');
    mark('.faq details', { group: true, step: .05 });
    mark('.cta'); mark('footer .wrap > *', { group: true, step: .06 });
  }
  var io = 'IntersectionObserver' in window ? new IntersectionObserver(function (ents) {
    ents.forEach(function (e) {
      if (!e.isIntersecting) return;
      e.target.classList.add('in'); io.unobserve(e.target);
      // terminada a entrada, a classe sai para os efeitos de mouse responderem sem atraso
      if (e.target.classList.contains('rv')) { var el = e.target, d = parseFloat(el.style.getPropertyValue('--d')) || 0; setTimeout(function () { el.classList.remove('rv', 'in', 'rv-left', 'rv-right'); }, 1300 + d * 1000); }
      if (e.target.classList.contains('stat')) countUp(e.target.querySelector('b'));
      if (!talked && e.target.classList.contains('wh')) { talked = true; ghost.classList.add('talk'); setTimeout(function () { ghost.classList.remove('talk'); }, 3800); }
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: .12 }) : null;
  $$('.rv, .steps, .scan').forEach(function (el) { if (io) io.observe(el); else el.classList.add('in'); });

  // números contam a partir do zero
  function countUp(b) {
    if (!b || reduce) return;
    var m = /^(\d+)(.*)$/.exec(b.textContent.trim()); if (!m) return;
    var to = +m[1], rest = m[2], t0 = performance.now(), dur = 1300;
    (function frame(t) {
      var k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      b.textContent = Math.round(to * e) + rest;
      if (k < 1) requestAnimationFrame(frame);
    })(t0);
  }

  /* ---------- Título do topo: linhas sobem de trás de uma máscara ---------- */
  var h1 = document.querySelector('.hero h1');
  if (h1 && !reduce) {
    var sp = h1.querySelector('span');
    var first = h1.firstChild && h1.firstChild.nodeType === 3 ? h1.firstChild.textContent : 'Seus dados,';
    var second = sp ? sp.textContent : '';
    h1.innerHTML = '<span class="ln"><i style="--d:.1s">' + first + '</i></span>' +
      '<span class="ln"><i style="--d:.28s"><span class="shine">' + second + '</span></i></span>';
  }

  /* ---------- Relatório do topo: inclina com o mouse e dobra a ponta ---------- */
  var scan = document.querySelector('.scan');
  if (scan) {
    $$('.occ li', scan).forEach(function (li, i) { li.style.setProperty('--i', i); });
    var glare = document.createElement('span'); glare.className = 'glare'; scan.appendChild(glare);
    var curl = document.createElement('span'); curl.className = 'curl'; scan.appendChild(curl);
    if (fine && !reduce) {
      scan.addEventListener('mousemove', function (e) {
        var r = scan.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
        scan.classList.add('live');
        scan.style.setProperty('--ry', ((x - .5) * 14).toFixed(2) + 'deg');
        scan.style.setProperty('--rx', ((.5 - y) * 10).toFixed(2) + 'deg');
        scan.style.setProperty('--gx', (x * 100).toFixed(1) + '%');
        scan.style.setProperty('--gy', (y * 100).toFixed(1) + '%');
      });
      scan.addEventListener('mouseleave', function () {
        scan.classList.remove('live'); scan.style.setProperty('--rx', '0deg'); scan.style.setProperty('--ry', '0deg');
      });
    }
  }

  /* ---------- Fundo do topo segue o mouse ---------- */
  var hero = document.querySelector('.hero'), hbg = document.querySelector('.hero-bg');
  if (hero && hbg && fine && !reduce) hero.addEventListener('mousemove', function (e) {
    var r = hero.getBoundingClientRect();
    hbg.style.setProperty('--bx', (((e.clientX - r.left) / r.width - .5) * -24).toFixed(1) + 'px');
    hbg.style.setProperty('--by', (((e.clientY - r.top) / r.height - .5) * -18).toFixed(1) + 'px');
  }, { passive: true });

  /* ---------- Cartões com luz que segue o mouse ---------- */
  $$('.step, .plan, .feat, .cmp-card, .bf-box').forEach(function (c) {
    c.classList.add('glow');
    var s = document.createElement('span'); s.className = 'spot'; s.setAttribute('aria-hidden', 'true'); c.insertBefore(s, c.firstChild);
    if (fine) c.addEventListener('mousemove', function (e) {
      var r = c.getBoundingClientRect();
      c.style.setProperty('--sx', (e.clientX - r.left) + 'px'); c.style.setProperty('--sy', (e.clientY - r.top) + 'px');
    }, { passive: true });
  });
  // a tabela não deve subir inteira: só a luz
  $$('.cmp-card, .bf-box').forEach(function (c) { c.classList.add('glow-flat'); });

  /* ---------- Botões com ímã ---------- */
  if (fine && !reduce) $$('.btn, .pill-field button').forEach(function (b) {
    b.addEventListener('mousemove', function (e) {
      var r = b.getBoundingClientRect();
      b.style.setProperty('--mx', ((e.clientX - r.left - r.width / 2) * .18).toFixed(1) + 'px');
      b.style.setProperty('--my', ((e.clientY - r.top - r.height / 2) * .3).toFixed(1) + 'px');
    });
    b.addEventListener('mouseleave', function () { b.style.setProperty('--mx', '0px'); b.style.setProperty('--my', '0px'); });
  });

  /* ---------- Coisas presas ao scroll: barra, vídeo e manchetes ---------- */
  var player = document.querySelector('.player');
  var sides = $$('.clip-side');
  var ticking = false;
  function onScroll() {
    if (ticking) return; ticking = true;
    requestAnimationFrame(function () {
      ticking = false;
      var h = root.scrollHeight - innerHeight;
      bar.style.transform = 'scaleX(' + (h > 0 ? Math.min(1, scrollY / h) : 0) + ')';
      if (reduce) return;
      if (player) {
        var r = player.getBoundingClientRect();
        // 0 quando o topo do vídeo entra pela base da tela, 1 quando ele chega a 15% do topo
        var k = Math.max(0, Math.min(1, (innerHeight - r.top) / (innerHeight * .85)));
        player.style.setProperty('--ps', (.86 + .14 * k).toFixed(4));
        player.style.setProperty('--pr', (36 - 16 * k).toFixed(1) + 'px');
      }
      sides.forEach(function (s, i) {
        var r = s.getBoundingClientRect(), c = (r.top + r.height / 2 - innerHeight / 2) / innerHeight;
        s.style.setProperty('--py', (c * (i ? -38 : 26)).toFixed(1) + 'px');
      });
    });
  }
  addEventListener('scroll', onScroll, { passive: true }); addEventListener('resize', onScroll); onScroll();
})();
