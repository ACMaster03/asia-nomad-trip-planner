(() => {
  const chapters = [...document.querySelectorAll('.chapter')];
  const screens = [...document.querySelectorAll('.screen')];
  const scenes = [...document.querySelectorAll('.scene')];
  const phone = document.querySelector('.phone');
  const wrap = document.querySelector('.phone-wrap');
  const journey = document.querySelector('.journey');
  const progress = document.querySelector('.chapter-progress i');
  const caption = document.querySelector('#chapter-caption');
  const captions = ['A little room to breathe', 'Your own kind of rhythm', 'The best plans are shared', 'Life between adventures', 'Wish you were here', 'Dreaming of what’s next'];
  let current = -1;
  let queued = false;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  function update() {
    queued = false;
    const height = innerHeight;
    let active = 0;
    chapters.forEach((chapter, i) => {
      if (chapter.getBoundingClientRect().top < height * .45) active = i;
    });
    const bounds = journey.getBoundingClientRect();
    const fraction = Math.max(0, Math.min(1, -bounds.top / (bounds.height - height)));
    progress.style.height = `${Math.max(5, fraction * 100)}%`;
    if (!reduced.matches && innerWidth > 650) {
      wrap.style.transform = `translateY(-48%) rotate(${Math.sin(fraction * Math.PI * 2) * 3}deg)`;
      document.querySelector('.hero-image').style.transform = `scale(1.04) translateY(${Math.min(scrollY, height) * .14}px)`;
    }
    if (active === current) return;
    current = active;
    chapters.forEach((chapter, i) => chapter.classList.toggle('active', i === active));
    screens.forEach((screen, i) => screen.classList.toggle('active', i === active));
    const sceneIndex = active === 2 ? 4 : active < 1 ? 0 : active < 4 ? 1 : active === 4 ? 2 : 3;
    scenes.forEach((scene, i) => scene.style.opacity = i === sceneIndex ? '1' : '0');
    phone.classList.toggle('dark', active >= 4);
    document.querySelector('.stage').classList.toggle('is-together', active === 2);
    caption.textContent = captions[active];
  }
  addEventListener('scroll', () => { if (!queued) { queued = true; requestAnimationFrame(update); } }, {passive:true});
  addEventListener('resize', update);
  update();
})();

(() => {
  const photos = [...document.querySelectorAll('.hero-photo')];
  const location = document.querySelector('.hero-location');
  if (!photos.length) return;

  const labels = [
    '01 / Morning through the mist',
    '02 / Daybreak in the hills',
    '03 / Coast at sunset',
    '04 / City after dark'
  ];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let current = reduced.matches ? 0 : Math.floor(Math.random() * photos.length);
  let rotation;

  function show(index) {
    current = index;
    photos.forEach((photo, i) => photo.classList.toggle('is-active', i === current));
    if (location) location.textContent = labels[current];
  }

  function start() {
    clearInterval(rotation);
    show(reduced.matches ? 0 : current);
    if (!reduced.matches) {
      rotation = setInterval(() => show((current + 1) % photos.length), 6000);
    }
  }

  reduced.addEventListener?.('change', start);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) clearInterval(rotation);
    else start();
  });
  start();
})();
