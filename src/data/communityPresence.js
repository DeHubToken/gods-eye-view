import * as Cesium from 'cesium';

const CONFIG_SOURCE = 'social-presence-host';
const APP_SOURCE = 'gods-eye-view';
const MAX_PEOPLE = 5000;

export function safeHttpUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value, window.location.href);
    return ['https:', 'http:'].includes(url.protocol) ? url.href : null;
  } catch { return null; }
}

/** Normalize one untrusted host record into the layer's small public schema. */
export function normalizePresenceRecord(record, index = 0) {
  const latitude = Number(record?.latitude ?? record?.lat);
  const longitude = Number(record?.longitude ?? record?.lon ?? record?.lng);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) return null;
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) return null;
  const id = String(record?.id ?? record?.user_id ?? `person-${index}`).trim().slice(0, 128);
  if (!id) return null;
  const name = String(record?.name ?? record?.username ?? 'Community member').trim().slice(0, 80);
  return {
    id,
    name: name || 'Community member',
    latitude,
    longitude,
    avatarUrl: safeHttpUrl(record?.avatar_url ?? record?.avatarUrl),
    profileUrl: safeHttpUrl(record?.profile_url ?? record?.profileUrl),
  };
}

export function normalizePresencePayload(payload) {
  const records = Array.isArray(payload) ? payload : payload?.people;
  if (!Array.isArray(records)) return [];
  return records.slice(0, MAX_PEOPLE).map(normalizePresenceRecord).filter(Boolean);
}

function initialsSvg(name) {
  const initials = String(name).split(/\s+/).filter(Boolean).slice(0, 2)
    .map((part) => part[0]).join('').toUpperCase() || '•';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><circle cx="32" cy="32" r="29" fill="#171717" stroke="#fff" stroke-width="4"/><text x="32" y="39" text-anchor="middle" font-family="system-ui,sans-serif" font-size="23" font-weight="700" fill="#fff">${initials.replace(/[<>&"']/g, '')}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function createCommunityPresenceLayer() {
  let dataSource = null;
  let viewerRef = null;
  let endpoint = null;
  let enabled = false;
  let count = 0;
  let lastUpdate = null;
  let lastError = null;
  let controlsListener = null;

  const configure = (candidate) => {
    const next = safeHttpUrl(candidate);
    if (!next) return false;
    endpoint = next;
    controlsListener?.();
    if (enabled && viewerRef) void layer.update(viewerRef);
    return true;
  };
  const onMessage = (event) => {
    const message = event?.data;
    if (!message || message.source !== CONFIG_SOURCE) return;
    if (message.type === 'configure') configure(message.endpoint);
    if (message.type === 'refresh' && enabled && viewerRef) void layer.update(viewerRef);
  };

  const layer = {
    id: 'community-presence',
    name: 'Community',
    icon: '◎',
    source: 'Host-provided, opt-in',
    updateInterval: 60_000,

    init(viewer) {
      viewerRef = viewer;
      dataSource = new Cesium.CustomDataSource('community-presence');
      dataSource.show = false;
      viewer.dataSources.add(dataSource);
      const queryEndpoint = new URLSearchParams(window.location.search).get('presenceEndpoint');
      if (queryEndpoint) configure(queryEndpoint);
      window.addEventListener('message', onMessage);
    },
    enable() { enabled = true; if (dataSource) dataSource.show = true; },
    disable() { enabled = false; if (dataSource) dataSource.show = false; },

    async update() {
      if (!endpoint || !dataSource) {
        lastError = 'Connect a community endpoint to load people';
        return true;
      }
      try {
        const response = await fetch(endpoint, { credentials: 'omit', headers: { Accept: 'application/json' } });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const people = normalizePresencePayload(await response.json());
        dataSource.entities.removeAll();
        for (const person of people) {
          dataSource.entities.add({
            id: `community:${person.id}`,
            name: person.name,
            position: Cesium.Cartesian3.fromDegrees(person.longitude, person.latitude, 30),
            billboard: {
              image: person.avatarUrl || initialsSvg(person.name),
              width: 38,
              height: 38,
              verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
              distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 20_000_000),
            },
            label: {
              text: person.name,
              font: '600 13px system-ui',
              fillColor: Cesium.Color.WHITE,
              outlineColor: Cesium.Color.BLACK,
              outlineWidth: 4,
              style: Cesium.LabelStyle.FILL_AND_OUTLINE,
              pixelOffset: new Cesium.Cartesian2(0, -48),
              distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 2_000_000),
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
            },
            properties: { profileUrl: person.profileUrl },
          });
        }
        count = people.length;
        lastUpdate = Date.now();
        lastError = null;
        return true;
      } catch (error) {
        lastError = `Community endpoint unavailable: ${error?.message || 'network error'}`;
        return false;
      }
    },

    setParams(params) {
      if (params?.endpoint) configure(params.endpoint);
      if (params?.requestPlacement) {
        const detail = { source: APP_SOURCE, type: 'presence-place-requested' };
        window.dispatchEvent(new CustomEvent('gev:presence-place-requested', { detail }));
        if (window.parent !== window) window.parent.postMessage(detail, '*');
      }
      return true;
    },
    getRowControls() {
      return { chips: [{
        id: 'place-me', label: 'PLACE ME ON THE MAP',
        title: 'Ask the host social platform to share your location',
        params: { requestPlacement: true }, disabled: !endpoint,
      }] };
    },
    setRowControlsListener(listener) { controlsListener = typeof listener === 'function' ? listener : null; },
    destroy(viewer) {
      window.removeEventListener('message', onMessage);
      if (dataSource) viewer.dataSources.remove(dataSource, true);
      dataSource = null; viewerRef = null; enabled = false; count = 0;
    },
    getStats() { return { count, lastUpdate, error: lastError, available: Boolean(endpoint) }; },
  };
  return layer;
}

export default createCommunityPresenceLayer();
