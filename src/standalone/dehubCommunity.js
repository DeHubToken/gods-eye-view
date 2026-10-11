import * as Cesium from 'cesium';
import { governorRequestRender } from '../renderGovernor.js';

const ENDPOINT =
  'https://aigxuutjaqsywioxjefr.supabase.co/functions/v1/map-presence';
const SOURCE = 'gods-eye-view';

export function validCoordinates(value) {
  return (
    typeof value?.latitude === 'number' &&
    Number.isFinite(value.latitude) &&
    Math.abs(value.latitude) <= 90 &&
    typeof value.longitude === 'number' &&
    Number.isFinite(value.longitude) &&
    Math.abs(value.longitude) <= 180
  );
}

export function installCommunityMap(viewer) {
  const panel = document.createElement('details');
  panel.id = 'dehub-community';
  panel.innerHTML = `<summary>DeHub community</summary>
    <p>Your pin is public and shown in an approximate 25 km area. Choose an area you are comfortable sharing.</p>
    <div class="community-actions"><button type="button" data-action="choose">Choose a spot</button>
    <button type="button" data-action="locate">Use my location</button>
    <button type="button" data-action="remove">Remove my pin</button>
    <button type="button" data-action="refresh">Refresh map</button></div>
    <p data-status role="status" aria-live="polite"></p>
    <div data-confirm hidden><p data-location></p><button type="button" data-action="save">Place me here</button>
    <button type="button" data-action="cancel">Cancel</button></div>`;
  const style = document.createElement('style');
  style.textContent = `#dehub-community{position:fixed;left:12px;bottom:76px;z-index:10000;width:min(310px,calc(100vw - 24px));padding:12px;border:1px solid #ffffff40;border-radius:12px;background:#101419f2;color:#fff;font:13px/1.5 system-ui;box-sizing:border-box}#dehub-community summary{cursor:pointer;font-weight:600}#dehub-community p{margin:10px 0}#dehub-community button{padding:9px 12px;border:1px solid #ffffff50;border-radius:7px;background:#283340;color:#fff;font:inherit;cursor:pointer;min-height:40px}#dehub-community button:disabled{opacity:.5;cursor:wait}#dehub-community button:focus-visible,#dehub-community summary:focus-visible{outline:2px solid #b9e1ff;outline-offset:3px}#dehub-community .community-actions{display:flex;gap:6px;flex-wrap:wrap}#dehub-community [hidden]{display:none}`;
  document.head.append(style);
  document.body.append(panel);
  const status = panel.querySelector('[data-status]');
  const confirm = panel.querySelector('[data-confirm]');
  const source = new Cesium.CustomDataSource('dehub-community');
  viewer.dataSources.add(source);
  const picker = new Cesium.ScreenSpaceEventHandler(viewer.canvas);
  let choosing = false;
  let candidate = null;
  let pending = null;
  let timeout;
  let disposed = false;
  let loading = false;
  const abort = new AbortController();
  const setStatus = (message) => {
    status.textContent = message;
  };
  const setBusy = (busy) => {
    for (const button of panel.querySelectorAll('button'))
      button.disabled = busy;
  };
  const request = (type, coordinates) => {
    if (pending) return;
    pending = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const message = {
      source: SOURCE,
      type,
      requestId: pending,
      ...coordinates,
    };
    setBusy(true);
    setStatus('Updating your pin…');
    timeout = setTimeout(() => {
      pending = null;
      setBusy(false);
      setStatus(
        'Could not update your pin. Open this globe from DeHub and try again.',
      );
    }, 35000);
    if (window.parent !== window) window.parent.postMessage(message, '*');
    else
      window.dispatchEvent(
        new CustomEvent('gev:presence-request', { detail: message }),
      );
  };
  async function refresh() {
    if (loading || disposed) return;
    loading = true;
    try {
      const response = await fetch(ENDPOINT, {
        credentials: 'omit',
        signal: AbortSignal.any([abort.signal, AbortSignal.timeout(15000)]),
      });
      if (!response.ok) throw new Error('Community unavailable');
      const payload = await response.json();
      if (!Array.isArray(payload.people))
        throw new Error('Invalid community response');
      if (disposed) return;
      source.entities.removeAll();
      for (const person of payload.people.slice(0, 5000)) {
        if (!validCoordinates(person) || typeof person.id !== 'string')
          continue;
        if (source.entities.getById(person.id)) continue;
        source.entities.add({
          id: person.id,
          name: String(person.name || 'Community member').slice(0, 80),
          position: Cesium.Cartesian3.fromDegrees(
            person.longitude,
            person.latitude,
          ),
          point: {
            pixelSize: 12,
            color: Cesium.Color.CYAN,
            outlineColor: Cesium.Color.WHITE,
            outlineWidth: 2,
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          },
          label: {
            text: String(person.name || 'Community member').slice(0, 80),
            font: '13px system-ui',
            pixelOffset: new Cesium.Cartesian2(0, -20),
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            outlineWidth: 3,
            distanceDisplayCondition: new Cesium.DistanceDisplayCondition(
              0,
              2000000,
            ),
          },
        });
      }
      governorRequestRender();
      if (!pending && !choosing)
        setStatus(`${source.entities.values.length} community pins`);
    } catch {
      if (!disposed)
        setStatus('Community pins could not load. Try Refresh map.');
    } finally {
      loading = false;
    }
  }
  const cancel = () => {
    choosing = false;
    candidate = null;
    confirm.hidden = true;
    viewer.canvas.style.cursor = '';
    source.entities.removeById('dehub-draft-pin');
    governorRequestRender();
  };
  picker.setInputAction(({ position }) => {
    if (!choosing || pending) return;
    const ray = viewer.camera.getPickRay(position);
    const point = ray && viewer.scene.globe.pick(ray, viewer.scene);
    if (!point) {
      setStatus('Choose a point on the globe.');
      return;
    }
    const location = Cesium.Cartographic.fromCartesian(point);
    candidate = {
      latitude: Cesium.Math.toDegrees(location.latitude),
      longitude: Cesium.Math.toDegrees(location.longitude),
    };
    source.entities.removeById('dehub-draft-pin');
    source.entities.add({
      id: 'dehub-draft-pin',
      position: point,
      point: {
        pixelSize: 18,
        color: Cesium.Color.YELLOW,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
      },
    });
    panel.querySelector('[data-location]').textContent =
      `Selected area: ${candidate.latitude.toFixed(2)}, ${candidate.longitude.toFixed(2)}`;
    confirm.hidden = false;
    panel.open = true;
    setStatus('Confirm to publish your approximate pin.');
    governorRequestRender();
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
  panel.addEventListener('click', (event) => {
    const action = event.target.closest('button')?.dataset.action;
    if (!action || pending) return;
    if (action === 'choose') {
      choosing = true;
      viewer.canvas.style.cursor = 'crosshair';
      setStatus('Tap a spot on the globe, then confirm below.');
    }
    if (action === 'cancel') {
      cancel();
      setStatus('Placement cancelled.');
    }
    if (action === 'save' && validCoordinates(candidate))
      request('presence-place-requested', candidate);
    if (action === 'locate') {
      cancel();
      request('presence-place-requested');
    }
    if (action === 'remove') {
      cancel();
      request('presence-remove-requested');
    }
    if (action === 'refresh') void refresh();
  });
  const onMessage = (event) => {
    if (event.source !== window.parent && event.source !== window) return;
    const message = event.data;
    if (message?.source !== 'social-presence-host') return;
    if (message.type === 'presence-result' && message.requestId === pending) {
      clearTimeout(timeout);
      pending = null;
      setBusy(false);
      if (message.error) setStatus(String(message.error).slice(0, 200));
      else {
        cancel();
        setStatus(
          message.removed
            ? 'Your pin was removed.'
            : 'Your approximate pin is on the map.',
        );
        void refresh();
      }
    }
    if (message.type === 'refresh') void refresh();
  };
  window.addEventListener('message', onMessage);
  let exit;
  if (window.parent !== window) {
    exit = document.createElement('button');
    exit.textContent = '← Arcade';
    exit.style.cssText =
      'position:fixed;top:12px;left:12px;z-index:10000;padding:10px 14px;border-radius:20px;background:#101419;color:white;border:1px solid #ffffff50;cursor:pointer';
    exit.onclick = () =>
      window.parent.postMessage({ source: SOURCE, type: 'exit' }, '*');
    document.body.append(exit);
  }
  void refresh();
  window.addEventListener(
    'pagehide',
    () => {
      disposed = true;
      abort.abort();
      clearTimeout(timeout);
      window.removeEventListener('message', onMessage);
      picker.destroy();
      if (!viewer.isDestroyed()) viewer.dataSources.remove(source, true);
      panel.remove();
      style.remove();
      exit?.remove();
    },
    { once: true },
  );
}
