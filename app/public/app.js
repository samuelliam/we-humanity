const runPipelineBtn = document.getElementById('run-pipeline-btn');
const pipelineBadgeEl = document.getElementById('pipeline-status-badge');
const pipelineBarEl = document.getElementById('pipeline-bar');
const pipelineSummaryEl = document.getElementById('pipeline-summary');
const pipelineErrorDetailsEl = document.getElementById('pipeline-error-details');
const pipelineErrorLogEl = document.getElementById('pipeline-error-log');
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
const igSlideCounterEl = document.getElementById('ig-slide-counter');
const igFullscreenBtn = document.getElementById('ig-fullscreen-btn');
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

const lightboxEl = document.getElementById('slide-lightbox');
const lightboxTitleEl = document.getElementById('lightbox-title');
const lightboxImgEl = document.getElementById('lightbox-img');
const lightboxDownloadEl = document.getElementById('lightbox-download');
const lightboxNativeFsBtn = document.getElementById('lightbox-native-fs');
const lightboxPrevBtn = document.getElementById('lightbox-prev');
const lightboxNextBtn = document.getElementById('lightbox-next');
const lightboxCloseBtn = document.getElementById('lightbox-close');

let stories = [];
let selectedStoryId = null;
let pollTimer = null;
let uiTickTimer = null;
let lastPipelineData = null;
let lastPipelineFetchedAt = 0;
let lightboxSlides = [];
let lightboxIndex = 0;

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
  const total = trackEl.children.length || 1;
  igSlideCounterEl.textContent = `${activeIdx + 1} / ${total}`;
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

trackEl.addEventListener('keydown', (event) => {
  if (event.key === 'ArrowLeft') {
    event.preventDefault();
    const base = pendingIndex !== null ? pendingIndex : getSlideIndexFromScroll();
    scrollToSlide(base - 1);
  } else if (event.key === 'ArrowRight') {
    event.preventDefault();
    const base = pendingIndex !== null ? pendingIndex : getSlideIndexFromScroll();
    scrollToSlide(base + 1);
  }
});

// --- Lightbox (<dialog>) ---
function renderLightbox() {
  const slide = lightboxSlides[lightboxIndex];
  if (!slide) return;
  lightboxTitleEl.textContent = `Slide ${lightboxIndex + 1} of ${lightboxSlides.length} — ${slide.filename}`;
  lightboxImgEl.src = slide.url;
  lightboxImgEl.alt = slide.alt || `Slide ${lightboxIndex + 1}`;
  lightboxDownloadEl.href = slide.url;
  lightboxDownloadEl.download = slide.filename;
  lightboxPrevBtn.disabled = lightboxIndex <= 0;
  lightboxNextBtn.disabled = lightboxIndex >= lightboxSlides.length - 1;
}

function openLightbox(slides, index) {
  lightboxSlides = slides;
  lightboxIndex = Math.max(0, Math.min(slides.length - 1, index));
  renderLightbox();
  if (!lightboxEl.open) lightboxEl.showModal();
}

lightboxPrevBtn.addEventListener('click', () => {
  if (lightboxIndex > 0) {
    lightboxIndex -= 1;
    renderLightbox();
  }
});

lightboxNextBtn.addEventListener('click', () => {
  if (lightboxIndex < lightboxSlides.length - 1) {
    lightboxIndex += 1;
    renderLightbox();
  }
});

function closeLightbox() {
  if (document.fullscreenElement === lightboxEl) {
    document.exitFullscreen().catch(() => {});
  }
  lightboxEl.close();
}

lightboxCloseBtn.addEventListener('click', closeLightbox);
lightboxEl.addEventListener('click', (event) => {
  if (event.target === lightboxEl) closeLightbox();
});
lightboxEl.addEventListener('keydown', (event) => {
  if (event.key === 'ArrowLeft') lightboxPrevBtn.click();
  else if (event.key === 'ArrowRight') lightboxNextBtn.click();
});

lightboxNativeFsBtn.addEventListener('click', async () => {
  try {
    if (document.fullscreenElement === lightboxEl) {
      await document.exitFullscreen();
    } else if (lightboxEl.requestFullscreen) {
      await lightboxEl.requestFullscreen();
    }
  } catch {
    // Browser blocked fullscreen; lightbox modal remains open
  }
});

document.addEventListener('fullscreenchange', () => {
  lightboxNativeFsBtn.textContent = document.fullscreenElement === lightboxEl
    ? 'Exit Fullscreen'
    : 'True Fullscreen';
});

igFullscreenBtn.addEventListener('click', () => {
  if (!lightboxSlides.length) return;
  const idx = pendingIndex !== null ? pendingIndex : getSlideIndexFromScroll();
  openLightbox(lightboxSlides, idx);
});

// --- Data & rendering ---
function formatTime(iso) {
  if (!iso) return 'Never';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function summarizeError(raw) {
  if (!raw) return 'Pipeline encountered an error.';
  const text = String(raw).trim();
  const cmdIdx = text.indexOf('Command failed:');
  const beforeCmd = cmdIdx > 0 ? text.slice(0, cmdIdx).trim() : text;
  const lines = beforeCmd.split('\n').map((l) => l.trim()).filter(Boolean);
  const meaningful = [...lines].reverse().find((l) => !l.startsWith('at ') && !l.startsWith('_modules/')) || lines[lines.length - 1] || text;
  return meaningful.length > 160 ? meaningful.slice(0, 157) + '…' : meaningful;
}

function formatDuration(sec) {
  if (!Number.isFinite(sec) || sec <= 0) return '';
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

function getEffectiveDuration(stage) {
  if (!stage.durationSec) return null;
  if (stage.state !== 'running') return stage.durationSec;
  const extra = Math.max(0, Math.floor((Date.now() - lastPipelineFetchedAt) / 1000));
  return stage.durationSec + extra;
}

function renderPipeline(data) {
  const running = Boolean(data.running);
  const stages = data.stages || [];
  const active = stages.find((s) => s.state === 'running') || null;
  const completedCount = stages.filter((s) => s.state === 'success' || s.state === 'skipped').length;
  const hasError = stages.some((s) => s.state === 'error') || data.run?.status === 'error';

  const activeSec = active ? getEffectiveDuration(active) : null;
  const activeTimeTag = activeSec ? ` (${formatDuration(activeSec)})` : '';
  runPipelineBtn.disabled = running;
  runPipelineBtn.textContent = running
    ? (active ? `Running ${active.code} · ${active.label}${activeTimeTag}…` : 'Starting Pipeline…')
    : 'Generate Story & Carousel';

  const stateKey = running ? 'running' : hasError ? 'error' : completedCount === stages.length && stages.length ? 'done' : 'idle';
  if (stopPipelineBtn) {
    stopPipelineBtn.hidden = !running;
  }

  pipelineBadgeEl.dataset.state = stateKey;
  pipelineBadgeEl.textContent = running ? (active ? active.code : 'Running') : data.run?.status === 'stopped' ? 'Stopped' : hasError ? 'Error' : stateKey === 'done' ? 'Done' : 'Ready';
  pipelineBarEl.max = stages.length || 4;
  pipelineBarEl.value = completedCount + (active ? 0.45 : 0);
  pipelineSummaryEl.dataset.error = hasError ? 'true' : 'false';

  if (running) {
    if (active) {
      pipelineSummaryEl.textContent = active.detail
        ? `${active.code} (${active.label}): ${active.detail}`
        : `Running ${active.code} (${active.label})…`;
    } else {
      pipelineSummaryEl.textContent = 'Starting pipeline…';
    }
    pipelineErrorDetailsEl.hidden = true;
  } else if (hasError) {
    const rawErr = data.run?.error || 'Pipeline encountered an error.';
    pipelineSummaryEl.textContent = summarizeError(rawErr);
    if (rawErr.length > 120 || rawErr.includes('\n')) {
      pipelineErrorLogEl.textContent = rawErr;
      pipelineErrorDetailsEl.hidden = false;
    } else {
      pipelineErrorDetailsEl.hidden = true;
    }
  } else if (data.run?.finishedAt) {
    pipelineSummaryEl.textContent = `Last run finished at ${formatTime(data.run.finishedAt)}.`;
    pipelineErrorDetailsEl.hidden = true;
  } else if (completedCount === stages.length && stages.length) {
    pipelineSummaryEl.textContent = 'Latest pipeline run completed.';
    pipelineErrorDetailsEl.hidden = true;
  } else {
    pipelineSummaryEl.textContent = 'Ready to run WF2 → WF3c → WF4.';
    pipelineErrorDetailsEl.hidden = true;
  }

  stageListEl.innerHTML = '';
  for (const stage of stages) {
    const li = document.createElement('li');
    li.className = 'stage-item';
    li.dataset.state = stage.state;
    const sec = getEffectiveDuration(stage);
    const durText = sec ? formatDuration(sec) : '';
    const stateLabel = stage.state === 'success' ? 'Done' : stage.state;
    li.innerHTML = `
      <div class="stage-row">
        <span class="status-dot" data-status="${stage.state}">${stage.code} · ${stage.label}</span>
        <span class="stage-meta">
          ${durText ? `<span class="stage-duration">${durText}</span>` : ''}
          <span class="stage-state">${stateLabel}</span>
        </span>
      </div>
      ${stage.detail ? `<p class="stage-detail">${stage.detail}</p>` : ''}
    `;
    stageListEl.appendChild(li);
  }

  if (running && !pollTimer) {
    pollTimer = setInterval(loadAll, 1500);
  } else if (!running && pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }

  if (running && !uiTickTimer) {
    uiTickTimer = setInterval(() => {
      if (lastPipelineData?.running) renderPipeline(lastPipelineData);
    }, 1000);
  } else if (!running && uiTickTimer) {
    clearInterval(uiTickTimer);
    uiTickTimer = null;
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
    const slideWord = story.slides.length === 1 ? 'slide' : 'slides';
    btn.innerHTML = `
      <strong>${story.title}</strong>
      <span>${story.slides.length} ${slideWord} · ${formatTime(story.renderedAt)}</span>
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
  const storyLightboxSlides = story.slides.map((s, i) => ({
    url: s.url,
    filename: s.filename,
    alt: `${story.title} — slide ${i + 1}`,
  }));
  lightboxSlides = storyLightboxSlides;

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
    img.addEventListener('click', () => openLightbox(storyLightboxSlides, idx));
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
    fileLi.innerHTML = `<a href="${slide.url}" target="_blank" rel="noopener">${slide.filename}</a> <span>${kb} KB</span>`;
    slideFilesListEl.appendChild(fileLi);

    const thumb1 = document.createElement('img');
    thumb1.src = slide.url;
    thumb1.alt = `${story.title} slide ${idx + 1}`;
    thumb1.addEventListener('click', () => openLightbox(storyLightboxSlides, idx));
    liThumbStripEl.appendChild(thumb1);

    const thumb2 = thumb1.cloneNode();
    thumb2.addEventListener('click', () => openLightbox(storyLightboxSlides, idx));
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

const subthemeSelectEl = document.getElementById('subtheme-select');
const customSubjectInputEl = document.getElementById('custom-subject-input');
const rerenderBtn = document.getElementById('rerender-btn');
const stopPipelineBtn = document.getElementById('stop-pipeline-btn');

async function triggerPipeline() {
  runPipelineBtn.disabled = true;
  runPipelineBtn.textContent = 'Starting…';
  const payload = {
    subTheme: subthemeSelectEl ? subthemeSelectEl.value : '',
    subject: customSubjectInputEl ? customSubjectInputEl.value.trim() : '',
  };
  try {
    const res = await fetch('/api/pipeline/trigger', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      pipelineBadgeEl.dataset.state = 'error';
      pipelineBadgeEl.textContent = 'Error';
      pipelineSummaryEl.dataset.error = 'true';
      pipelineSummaryEl.textContent = err.error || 'Failed to trigger pipeline.';
      runPipelineBtn.disabled = false;
      runPipelineBtn.textContent = 'Generate Story & Carousel';
      return;
    }
  } catch (err) {
    pipelineBadgeEl.dataset.state = 'error';
    pipelineBadgeEl.textContent = 'Error';
    pipelineSummaryEl.dataset.error = 'true';
    pipelineSummaryEl.textContent = err.message || 'Network error triggering pipeline.';
    runPipelineBtn.disabled = false;
    runPipelineBtn.textContent = 'Generate Story & Carousel';
    return;
  }
  await loadAll();
}

async function rerenderCurrentStory() {
  if (!selectedStoryId || !rerenderBtn) return;
  rerenderBtn.disabled = true;
  rerenderBtn.textContent = 'Re-styling…';
  try {
    const res = await fetch(`/api/stories/${encodeURIComponent(selectedStoryId)}/rerender`, { method: 'POST' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      pipelineBadgeEl.dataset.state = 'error';
      pipelineBadgeEl.textContent = 'Error';
      pipelineSummaryEl.dataset.error = 'true';
      pipelineSummaryEl.textContent = err.error || 'Failed to re-style carousel.';
    }
  } catch (err) {
    pipelineBadgeEl.dataset.state = 'error';
    pipelineBadgeEl.textContent = 'Error';
    pipelineSummaryEl.dataset.error = 'true';
    pipelineSummaryEl.textContent = err.message || 'Network error re-styling carousel.';
  } finally {
    rerenderBtn.disabled = false;
    rerenderBtn.textContent = 'Re-style Carousel';
  }
  await loadAll();
}

if (rerenderBtn) {
  rerenderBtn.addEventListener('click', rerenderCurrentStory);
}

async function stopPipeline() {
  if (!stopPipelineBtn) return;
  stopPipelineBtn.disabled = true;
  stopPipelineBtn.textContent = 'Stopping…';
  try {
    await fetch('/api/pipeline/stop', { method: 'POST' });
  } catch {} finally {
    stopPipelineBtn.disabled = false;
    stopPipelineBtn.textContent = 'Stop Run';
  }
  await loadAll();
}

if (stopPipelineBtn) {
  stopPipelineBtn.addEventListener('click', stopPipeline);
}

async function loadAll() {
  const [pipeRes, stRes] = await Promise.all([
    fetch('/api/pipeline'),
    fetch('/api/stories'),
  ]);
  if (pipeRes.ok) {
    lastPipelineData = await pipeRes.json();
    lastPipelineFetchedAt = Date.now();
    renderPipeline(lastPipelineData);
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

