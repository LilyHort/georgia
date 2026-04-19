function formatCoordsText(lat, lng) {
  const a = Number.parseFloat(lat);
  const b = Number.parseFloat(lng);
  return `${a.toFixed(6)}, ${b.toFixed(6)}`;
}

function copyCoordsToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text);
  }
  return new Promise((resolve, reject) => {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'absolute';
    area.style.left = '-9999px';
    document.body.appendChild(area);
    area.select();
    try {
      document.execCommand('copy');
      resolve();
    } catch (err) {
      reject(err);
    } finally {
      document.body.removeChild(area);
    }
  });
}

let coordsTooltipHideId = 0;

function notifyCoordsCopied(message) {
  const live = document.getElementById('coords-copy-live');
  const tooltip = document.querySelector('.js-coords-tooltip');
  const textEl = document.querySelector('.js-coords-tooltip-text');

  if (textEl) {
    textEl.textContent = message;
  }

  if (live) {
    live.textContent = '';
    window.requestAnimationFrame(() => {
      live.textContent = message;
    });
  }

  if (tooltip) {
    tooltip.classList.add('coords-tooltip--visible');
    window.clearTimeout(coordsTooltipHideId);
    coordsTooltipHideId = window.setTimeout(() => {
      tooltip.classList.remove('coords-tooltip--visible');
    }, 2800);
  }
}

function bindCoordsCopyOnRoot(root, itemSelector) {
  if (!root) {
    return;
  }

  const handleActivate = (item) => {
    const { lat, lng } = item.dataset;
    if (lat === undefined || lng === undefined || lat === '' || lng === '') {
      return;
    }
    const text = formatCoordsText(lat, lng);
    copyCoordsToClipboard(text)
      .then(() => notifyCoordsCopied('Координаты скопированы'))
      .catch(() => notifyCoordsCopied('Не удалось скопировать координаты'));
  };

  root.addEventListener('click', (e) => {
    const item = e.target.closest(itemSelector);
    if (!item || !root.contains(item)) {
      return;
    }
    handleActivate(item);
  });

  root.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') {
      return;
    }
    const item = e.target.closest(itemSelector);
    if (!item || !root.contains(item) || e.target !== item) {
      return;
    }
    e.preventDefault();
    handleActivate(item);
  });
}

function initPlaceCoordsCopy() {
  bindCoordsCopyOnRoot(document.querySelector('.cards'), '.cards__item--has-coords');
}

function initModalPlaceCoordsCopy() {
  bindCoordsCopyOnRoot(document.querySelector('.js-trip-days-modal'), '.map-modal__place--has-coords');
}

/* global ymaps */
const ymapsGlobal = typeof ymaps !== 'undefined' ? ymaps : undefined;

const GEO_DEFAULT_CENTER = [42.32, 43.36];
const GEO_DEFAULT_ZOOM = 7;

/** Рамка Грузии (WGS84): юго-запад и северо-восток — ограничивает панорамирование. */
const GEORGIA_RESTRICT_BOUNDS = [
  [41.04, 39.86],
  [43.63, 46.78],
];

/** Метки с координатами из блока карточек маршрута (см. data-point.pug). */
function collectRouteMapPins() {
  const cardsRoot = document.querySelector('.cards');
  if (!cardsRoot) {
    return [];
  }

  const out = [];
  cardsRoot.querySelectorAll('.cards__card').forEach((card) => {
    const coordsBtn = card.querySelector('.cards__item--has-coords[data-lat][data-lng]');
    if (!coordsBtn || !card.id) {
      return;
    }
    const lat = Number.parseFloat(coordsBtn.dataset.lat);
    const lng = Number.parseFloat(coordsBtn.dataset.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return;
    }
    const titleEl = card.querySelector('.cards__card-title');
    const title = titleEl && titleEl.textContent ? titleEl.textContent.trim() : '';
    out.push({ anchorId: card.id, lat, lng, title });
  });
  return out;
}

const ROUTE_CARD_FOCUS_CLASS = 'cards__card--route-focus';
const ROUTE_CARD_HASH_PREFIX = 'route-point-';

let routeCardFocusTimerId = 0;

function clearRouteCardFocus() {
  document.querySelectorAll(`.${ROUTE_CARD_FOCUS_CLASS}`).forEach((node) => {
    node.classList.remove(ROUTE_CARD_FOCUS_CLASS);
  });
}

function scheduleRouteCardFocusRemoval(el) {
  window.clearTimeout(routeCardFocusTimerId);
  routeCardFocusTimerId = window.setTimeout(() => {
    el.classList.remove(ROUTE_CARD_FOCUS_CLASS);
  }, 3800);
}

/**
 * Прокрутка к карточке маршрута: по центру вьюпорта и краткая зелёная подсветка.
 * @param {string} anchorId — id элемента (например route-point-3)
 * @param {{ instant?: boolean }} [options] — instant: без анимации (открытие по ссылке с хэшем)
 */
function scrollToRouteCard(anchorId, options = {}) {
  const { instant = false } = options;
  const el = document.getElementById(anchorId);
  if (!el || !el.classList.contains('cards__card')) {
    return;
  }
  clearRouteCardFocus();
  el.scrollIntoView({
    behavior: instant ? 'auto' : 'smooth',
    block: 'center',
    inline: 'center',
  });
  history.replaceState(null, '', `#${anchorId}`);
  el.classList.add(ROUTE_CARD_FOCUS_CLASS);
  scheduleRouteCardFocusRemoval(el);
}

function initRouteCardDeepLinks() {
  document.addEventListener('click', (e) => {
    const link = e.target.closest(`a[href^="#${ROUTE_CARD_HASH_PREFIX}"]`);
    if (!link) {
      return;
    }
    const href = link.getAttribute('href');
    if (!href || href.length < 2) {
      return;
    }
    const id = href.slice(1);
    const card = document.getElementById(id);
    if (!card || !card.classList.contains('cards__card')) {
      return;
    }
    e.preventDefault();
    scrollToRouteCard(id);
  });

  const rawHash = window.location.hash;
  if (rawHash.length > 1) {
    const id = rawHash.slice(1);
    if (id.startsWith(ROUTE_CARD_HASH_PREFIX)) {
      window.requestAnimationFrame(() => {
        scrollToRouteCard(id, { instant: true });
      });
    }
  }
}

function initYandexUserMarkersMap() {
  const root = document.querySelector('.js-yandex-map-block');
  if (!root) {
    return;
  }

  const mapEl = root.querySelector('.js-yandex-map');
  if (!mapEl) {
    return;
  }

  if (!ymapsGlobal) {
    return;
  }

  ymapsGlobal.ready(() => {
    const map = new ymapsGlobal.Map(mapEl, {
      center: GEO_DEFAULT_CENTER,
      zoom: GEO_DEFAULT_ZOOM,
      controls: ['zoomControl', 'fullscreenControl'],
    });

    map.options.set('restrictMapArea', GEORGIA_RESTRICT_BOUNDS);
    map.setBounds(GEORGIA_RESTRICT_BOUNDS, {
      checkZoomRange: true,
      zoomMargin: 28,
      duration: 0,
    });

    const fitMapViewport = () => {
      map.container.fitToViewport();
    };
    window.addEventListener('resize', fitMapViewport);
    requestAnimationFrame(fitMapViewport);

    const placemarkBaseHref =
      `data:image/svg+xml,${encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"/>'
      )}`;

    const placemarkFlagIconLayout = ymapsGlobal.templateLayoutFactory.createClass(
      '<div style="font-size:34px;line-height:40px;text-align:center;width:40px;">&#127468;&#127466;</div>'
    );

    const pins = collectRouteMapPins();

    function buildFlagPlacemark(pin) {
      const coords = [pin.lat, pin.lng];
      const coordLine = formatCoordsText(pin.lat, pin.lng);
      const nameLine = pin.title ? pin.title : 'Точка маршрута';
      const balloonLink = `<p style="margin:10px 0 0;"><a href="#${pin.anchorId}">К карточке маршрута</a></p>`;
      const placemark = new ymapsGlobal.Placemark(
        coords,
        {
          hintContent: nameLine,
          balloonContentHeader: nameLine,
          balloonContentBody: `Координаты: ${coordLine}${balloonLink}`,
        },
        {
          iconLayout: 'default#imageWithContent',
          iconImageHref: placemarkBaseHref,
          iconImageSize: [40, 40],
          iconImageOffset: [-20, -20],
          iconContentOffset: [0, 0],
          iconContentLayout: placemarkFlagIconLayout,
        }
      );
      placemark.events.add('click', () => {
        scrollToRouteCard(pin.anchorId);
      });
      return placemark;
    }

    pins.forEach((pin) => {
      map.geoObjects.add(buildFlagPlacemark(pin));
    });

    if (pins.length > 0) {
      const markerBounds = map.geoObjects.getBounds();
      if (markerBounds) {
        map.setBounds(markerBounds, {
          checkZoomRange: true,
          zoomMargin: 56,
          duration: 200,
        });
      }
    }
  });
}

function initTripDaysModal() {
  const openBtn = document.querySelector('.js-trip-days-open');
  const modal = document.querySelector('.js-trip-days-modal');
  const closeEls = document.querySelectorAll('.js-trip-days-close');

  if (!openBtn || !modal || typeof modal.showModal !== 'function') {
    return;
  }

  openBtn.addEventListener('click', () => {
    modal.showModal();
  });

  closeEls.forEach((el) => {
    el.addEventListener('click', () => {
      modal.close();
    });
  });

  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.close();
    }
  });
}

function initHeroTitleScrollShift() {
  const hero = document.querySelector('.hero');
  const title = document.querySelector('.hero__title');
  if (!hero || !title) {
    return;
  }

  const mq = window.matchMedia('(max-width: 768px)');
  let rafPending = false;

  const apply = () => {
    rafPending = false;
    if (!mq.matches) {
      title.style.removeProperty('--hero-scroll-shift');
      return;
    }
    const scrollY = window.scrollY || document.documentElement.scrollTop || 0;
    const maxBasis = hero.offsetHeight || 500;
    const t = Math.max(0, Math.min(scrollY, maxBasis));
    const shiftPx = t * 0.6;
    title.style.setProperty('--hero-scroll-shift', `${shiftPx}px`);
  };

  const schedule = () => {
    if (rafPending) {
      return;
    }
    rafPending = true;
    requestAnimationFrame(apply);
  };

  mq.addEventListener('change', apply);
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);
  apply();
}

initPlaceCoordsCopy();
initModalPlaceCoordsCopy();
initRouteCardDeepLinks();
initYandexUserMarkersMap();
initTripDaysModal();
initHeroTitleScrollShift();
