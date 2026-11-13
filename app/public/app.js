const runPipelineBtn = document.getElementById('run-pipeline-btn');
const pipelineBadgeEl = document.getElementById('pipeline-status-badge');
const pipelineBarEl = document.getElementById('pipeline-bar');
const pipelineSummaryEl = document.getElementById('pipeline-summary');
const stageListEl = document.getElementById('stage-list');
const storyListEl = document.getElementById('story-list');
const storyCountEl = document.getElementById('story-count');
const refreshBtn = document.getElementById('refresh-btn');
const emptyStateEl = document.getElementById('empty-state');
const previewContainerEl = document.getElementById('preview-container');

const storyPillarEl = document.getElementById('story-pillar');
const storyTitleEl = document.getElementById('story-title');
const storySubmetaEl = document.getElementById('story-submeta');
const igPillarSubEl = document.getElementById('ig-pillar-sub');
const igCaptionEl = document.getElementById('ig-caption');
const liCaptionEl = document.getElementById('li-caption');
const xPost1El = document.getElementById('x-post-1');
const xPost2El = document.getElementById('x-post-2');
const slideFilesListEl = document.getElementById('slide-files-list');
const creditsListEl = document.getElementById('credits-list');
const liThumbStripEl = document.getElementById('li-thumb-strip');
const xThumbStripEl = document.getElementById('x-thumb-strip');

const trackEl = document.getElementById('ig-carousel-track');
const markersEl = document.getElementById('ig-carousel-markers');
const statusEl = document.getElementById('ig-carousel-status');
const prevBtn = document.querySelector('.carousel-btn[data-direction="previous"]');
const nextBtn = document.querySelector('.carousel-btn[data-direction="next"]');

let stories = [];
let selectedStoryId = null;
let pollTimer = null;

// --- Copy button (modern-web-guidance: Invoker Commands + fallback) ---
const copyTimers = new WeakMap();
let lastCopyMessage = '';

function legacyCopy(text) {
  const field = Object.assign(document.createElement('textarea'), { value: text });
  field.setAttribute('readonly', '');
  field.style.cssText = 'position:fixed;inset-block-start:0;opacity:0';
  document.body.append(field);
  field.select();
  try {
    return document.execCommand('copy');
  } finally {
    field.remove();
  }
}

function reportCopy(button, ok) {
  const tip = button.nextElementSibling;
  clearTimeout(copyTimers.get(button));
  button.removeAttribute('data-copied');
  button.removeAttribute('data-failed');
  let message = ok ? 'Copied' : 'Copy failed';
  if (message === lastCopyMessage) message += '\u00A0';
  lastCopyMessage = message;
  tip.textContent = '';
  void button.offsetWidth;
  button.setAttribute(ok ? 'data-copied' : 'data-failed', '');
  requestAnimationFrame(() => {
    tip.textContent = message;
  });
  copyTimers.set(button, setTimeout(() => {
    button.removeAttribute('data-copied');
    button.removeAttribute('data-failed');
    tip.textContent = '';
  }, 2000));
}

async function handleCopy(button, target) {
  const text = target.matches('input, textarea') ? target.value : target.innerText.trim();
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    reportCopy(button, true);
  } catch {
    if (legacyCopy(text)) {
      reportCopy(button, true);
    } else {
      reportCopy(button, false);
    }
  }
}

document.addEventListener('command', (event) => {
  if (event.command.startsWith('--copy')) handleCopy(event.source, event.target);
}, true);

if (!('CommandEvent' in window)) {
  document.addEventListener('click', (event) => {
    const button = event.target.closest('button[command^="--copy"]');
    if (!button) return;
    const target = document.getElementById(button.getAttribute('commandfor'));
    if (target) handleCopy(button, target);
  });
}

// --- Tabs (modern-web-guidance: focusgroup + hidden=until-found + beforematch) ---
const tabs = [...document.querySelectorAll('.tablist [role="tab"]')];
const panels = [...document.querySelectorAll('.tabpanels-stack > [role="tabpanel"]')];

function selectTab(selectedTab) {
  tabs.forEach((tab, idx) => {
    const isSelected = tab === selectedTab;
    tab.ariaSelected = String(isSelected);
    tab.toggleAttribute('focusgroupstart', isSelected);
    const panel = panels[idx];
    if (isSelected) {
      panel.removeAttribute('hidden');
      panel.setAttribute('tabindex', '0');
    } else {
      panel.setAttribute('hidden', 'until-found');
      panel.removeAttribute('tabindex');
    }
  });
  selectedTab.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

tabs.forEach((tab) => {
  tab.addEventListener('click', () => selectTab(tab));
  tab.addEventListener('focus', () => selectTab(tab));
});

panels.forEach((panel, idx) => {
  panel.addEventListener('beforematch', () => selectTab(tabs[idx]));
});

// --- Carousel (modern-web-guidance: scroll snap + rAF + scrollend/debounce) ---
let settledIndex = 0;
let pendingIndex = null;
let rafId = null;
let fallbackTimer = null;

function getSlideIndexFromScroll() {
  const width = trackEl.clientWidth;
  if (!width) return 0;
  const maxIdx = Math.max(0, trackEl.children.length - 1);
  return Math.max(0, Math.min(maxIdx, Math.round(trackEl.scrollLeft / width)));
}

function updateMarkers(activeIdx) {
  const buttons = [...markersEl.querySelectorAll('button')];
  buttons.forEach((btn, idx) => {
    btn.setAttribute('aria-current', idx === activeIdx ? 'true' : 'false');
  });
}

function updateNavButtons(activeIdx) {
  const count = trackEl.children.length;
  prevBtn.disabled = activeIdx <= 0;
  nextBtn.disabled = activeIdx >= count - 1;
}

function scrollToSlide(index) {
  const count = trackEl.children.length;
  if (!count) return;
  const clamped = Math.max(0, Math.min(count - 1, index));
  pendingIndex = clamped;
  updateMarkers(clamped);
  const slide = trackEl.children[clamped];
  trackEl.scrollTo({ left: slide.offsetLeft, behavior: 'smooth' });
}

function onScrollSettled() {
  const current = getSlideIndexFromScroll();
  pendingIndex = null;
  updateMarkers(current);
  updateNavButtons(current);
  if (current !== settledIndex) {
    settledIndex = current;
    statusEl.textContent = `Slide ${current + 1} of ${trackEl.children.length}`;
  }
}

trackEl.addEventListener('scroll', () => {
  if (pendingIndex !== null) return;
  if (rafId === null) {
    rafId = requestAnimationFrame(() => {
      rafId = null;
      updateMarkers(getSlideIndexFromScroll());
    });
  }
  if (!('onscrollend' in window)) {
    clearTimeout(fallbackTimer);
    fallbackTimer = setTimeout(onScrollSettled, 120);
  }
}, { passive: true });

if ('onscrollend' in window) {
  trackEl.addEventListener('scrollend', onScrollSettled);
}

prevBtn.addEventListener('click', () => {
  const base = pendingIndex !== null ? pendingIndex : getSlideIndexFromScroll();
  scrollToSlide(base - 1);
});

nextBtn.addEventListener('click', () => {
  const base = pendingIndex !== null ? pendingIndex : getSlideIndexFromScroll();
  scrollToSlide(base + 1);
});

// --- Data & rendering ---
function formatTime(iso) {
  if (!iso) return 'Never';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function renderPipeline(data) {
  const running = Boolean(data.running);
  const stages = data.stages || [];
  const completedCount = stages.filter((s) => s.state === 'success' || s.state === 'skipped').length;
  const hasError = stages.some((s) => s.state === 'error') || data.run?.status === 'error';

  runPipelineBtn.disabled = running;
  runPipelineBtn.textContent = running ? 'Running Pipeline…' : 'Generate Story & Carousel';

  pipelineBadgeEl.textContent = running ? 'Running' : hasError ? 'Error' : completedCount === stages.length && stages.length ? 'Done' : 'Ready';
  pipelineBarEl.max = stages.length || 4;
  pipelineBarEl.value = completedCount;

  if (running) {
    const active = stages.find((s) => s.state === 'running');
    pipelineSummaryEl.textContent = active
      ? `Running ${active.code} (${active.label})…`
      : 'Starting pipeline…';
  } else if (hasError) {
    pipelineSummaryEl.textContent = data.run?.error || 'Pipeline encountered an error.';
  } else if (data.run?.finishedAt) {
    pipelineSummaryEl.textContent = `Last run finished at ${formatTime(data.run.finishedAt)}.`;
  } else if (completedCount === stages.length && stages.length) {
    pipelineSummaryEl.textContent = 'Latest pipeline run completed.';
  } else {
    pipelineSummaryEl.textContent = 'Ready to run WF2 → WF3c → WF4.';
  }

  stageListEl.innerHTML = '';
  for (const stage of stages) {
    const li = document.createElement('li');
    li.className = 'stage-item';
    li.innerHTML = `
      <span class="status-dot" data-status="${stage.state}">${stage.code} · ${stage.label}</span>
      <span class="stage-state">${stage.state}</span>
    `;
    stageListEl.appendChild(li);
  }

  if (running && !pollTimer) {
    pollTimer = setInterval(loadAll, 1500);
  } else if (!running && pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

function renderStoryList() {
  storyCountEl.textContent = String(stories.length);
  storyListEl.innerHTML = '';
  for (const story of stories) {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'story-btn';
    btn.setAttribute('aria-current', story.storyId === selectedStoryId ? 'true' : 'false');
    btn.innerHTML = `
      <strong>${story.title}</strong>
      <span>${story.slides.length} slides · ${formatTime(story.renderedAt)}</span>
    `;
    btn.addEventListener('click', () => {
      selectedStoryId = story.storyId;
      renderStoryList();
      renderSelectedStory();
    });
    li.appendChild(btn);
    storyListEl.appendChild(li);
  }
}

function renderSelectedStory() {
  const story = stories.find((s) => s.storyId === selectedStoryId) || stories[0];
  if (!story) {
    emptyStateEl.hidden = false;
    previewContainerEl.hidden = true;
    return;
  }
  emptyStateEl.hidden = true;
  previewContainerEl.hidden = false;

  storyPillarEl.textContent = story.pillar || 'WE, HUMANITY';
  storyTitleEl.textContent = story.title;
  storySubmetaEl.textContent = `Story ID: ${story.storyId} · Rendered ${formatTime(story.renderedAt)}`;
  igPillarSubEl.textContent = story.pillar || 'Design & Engineering';

  igCaptionEl.textContent = story.instagramCaption || '(No Instagram caption recorded)';
  liCaptionEl.textContent = story.linkedinCaption || '(No LinkedIn caption recorded)';
  xPost1El.textContent = story.xThread?.post1 || '(No X post 1 recorded)';
  xPost2El.textContent = story.xThread?.post2 || '(No X post 2 recorded)';

  // Carousel slides & markers
  trackEl.innerHTML = '';
  markersEl.innerHTML = '';
  slideFilesListEl.innerHTML = '';
  liThumbStripEl.innerHTML = '';
  xThumbStripEl.innerHTML = '';

  const total = story.slides.length;
  story.slides.forEach((slide, idx) => {
    const slideEl = document.createElement('div');
    slideEl.className = 'carousel-slide';
    slideEl.setAttribute('role', 'group');
    slideEl.setAttribute('aria-roledescription', 'slide');
    slideEl.setAttribute('aria-label', `${idx + 1} of ${total}`);
    slideEl.dataset.markerName = `Go to slide ${idx + 1}`;
    const img = document.createElement('img');
    img.src = slide.url;
    img.alt = `${story.title} — slide ${idx + 1}`;
    slideEl.appendChild(img);
    trackEl.appendChild(slideEl);

    const marker = document.createElement('button');
    marker.type = 'button';
    marker.setAttribute('aria-label', `Go to slide ${idx + 1}`);
    marker.setAttribute('aria-current', idx === 0 ? 'true' : 'false');
    marker.addEventListener('click', () => scrollToSlide(idx));
    markersEl.appendChild(marker);

    const fileLi = document.createElement('li');
    const kb = Math.round(slide.sizeBytes / 1024);
    fileLi.innerHTML = `<a href="${slide.url}" target="_blank" rel="noopener">${slide.filename}</a> <span>(${kb} KB)</span>`;
    slideFilesListEl.appendChild(fileLi);

    const thumb1 = document.createElement('img');
    thumb1.src = slide.url;
    thumb1.alt = `${story.title} slide ${idx + 1}`;
    liThumbStripEl.appendChild(thumb1);

    const thumb2 = thumb1.cloneNode();
    xThumbStripEl.appendChild(thumb2);
  });

  creditsListEl.innerHTML = '';
  if (story.credits.length) {
    for (const credit of story.credits) {
      const li = document.createElement('li');
      li.textContent = credit;
      creditsListEl.appendChild(li);
    }
  } else {
    const li = document.createElement('li');
    li.textContent = 'Credits embedded in rendered slides.';
    creditsListEl.appendChild(li);
  }

  settledIndex = 0;
  pendingIndex = null;
  trackEl.scrollLeft = 0;
  statusEl.textContent = '';
  updateMarkers(0);
  updateNavButtons(0);
}

async function triggerPipeline() {
  runPipelineBtn.disabled = true;
  runPipelineBtn.textContent = 'Starting…';
  const res = await fetch('/api/pipeline/trigger', { method: 'POST' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    alert(err.error || 'Failed to trigger pipeline');
  }
  await loadAll();
}

async function loadAll() {
  const [pipeRes, stRes] = await Promise.all([
    fetch('/api/pipeline'),
    fetch('/api/stories'),
  ]);
  if (pipeRes.ok) {
    renderPipeline(await pipeRes.json());
  }
  if (stRes.ok) {
    const stData = await stRes.json();
    stories = stData.stories || [];
    if (!selectedStoryId && stories.length) {
      selectedStoryId = stories[0].storyId;
    }
    renderStoryList();
    renderSelectedStory();
  }
}

runPipelineBtn.addEventListener('click', triggerPipeline);
refreshBtn.addEventListener('click', loadAll);
loadAll();

