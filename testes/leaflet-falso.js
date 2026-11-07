// Leaflet MÍNIMO e FALSO, usado só nos testes automatizados (o sandbox não tem internet).
// Implementa apenas o que o projeto usa e cria elementos DOM para os marcadores.
(function () {
  class Evented {
    constructor() { this._h = {}; }
    on(t, f) { (this._h[t] = this._h[t] || []).push(f); return this; }
    fire(t, e) { (this._h[t] || []).forEach((f) => f(e || {})); }
  }
  class Layer extends Evented {
    addTo(c) { c.addLayer(this); return this; }
    bindTooltip(conteudo, opcoes) { this._tip = { conteudo, opcoes }; return this; }
    setZIndexOffset() {}
    bringToFront() { return this; }
    getElement() { return this._el || null; }
  }
  const registro = window.__camadas = [];
  function montar(camada, mapa) {
    camada._mapa = mapa;
    if (camada._icone) {
      const el = document.createElement("div");
      el.className = "leaflet-marker-icon " + (camada._icone.className || "");
      const h = camada._icone.html;
      if (h instanceof HTMLElement) el.appendChild(h); else if (h) el.innerHTML = h;
      el.title = camada.options.title || "";
      if (camada._tip && camada._tip.opcoes.permanent) {
        const t = document.createElement("span"); t.className = "leaflet-tooltip";
        if (camada._tip.conteudo instanceof HTMLElement) t.appendChild(camada._tip.conteudo.cloneNode(true)); else t.innerHTML = camada._tip.conteudo;
        el.appendChild(t);
      }
      camada._el = el;
      mapa._div.appendChild(el);
      el.addEventListener("click", () => camada.fire("click", {}));
      camada.fire("add");
    }
  }
  class Marker extends Layer {
    constructor(pos, o) { super(); this._pos = pos; this.options = o || {}; this._icone = this.options.icon; registro.push(this); }
    setLatLng(p) { this._pos = p; return this; }
    getLatLng() { return { lat: this._pos[0], lng: this._pos[1] }; }
    setIcon(i) {
      this._icone = i;
      if (this._el) { const velho = this._el; const m = this._mapa; m._div.removeChild(velho); montar(this, m); }
    }
  }
  class CircleMarker extends Layer {
    constructor(pos, o) { super(); this._pos = pos; this.options = o || {}; this.tipo = "circulo"; registro.push(this); }
  }
  class Polyline extends Layer {
    constructor(c, o) { super(); this._c = c; this.options = o || {}; this.tipo = "linha"; registro.push(this); }
    setLatLngs(c) { this._c = c; return this; }
    getLatLngs() { return this._c; }
    setStyle(o) { Object.assign(this.options, o); return this; }
    getBounds() { return L.latLngBounds(this._c); }
  }
  class Group extends Layer {
    constructor() { super(); this._itens = []; this.tipo = "grupo"; registro.push(this); }
    addLayer(l) { if (!this._itens.includes(l)) this._itens.push(l); l._grupo = this; if (this._mapa) montar(l, this._mapa); return this; }
    clearLayers() { this._itens.forEach((l) => { if (l._el && l._el.parentNode) l._el.parentNode.removeChild(l._el); }); this._itens = []; return this; }
    addTo(m) { m.addLayer(this); return this; }
  }
  class Mapa extends Evented {
    constructor(id, o) {
      super(); this._div = document.getElementById(id); this.options = o; this._camadas = new Set();
      this.doubleClickZoom = { _on: true, enable() { this._on = true; }, disable() { this._on = false; } };
      window.__mapa = this;
    }
    addLayer(l) {
      this._camadas.add(l);
      if (l instanceof Group) { l._mapa = this; l._itens.forEach((i) => montar(i, this)); } else montar(l, this);
      return this;
    }
    removeLayer(l) {
      this._camadas.delete(l);
      const itens = l instanceof Group ? l._itens : [l];
      itens.forEach((i) => { if (i._el && i._el.parentNode) i._el.parentNode.removeChild(i._el); i._el = null; });
      if (l instanceof Group) l._mapa = null; else l._mapa = null;
      return this;
    }
    getContainer() { return this._div; }
    fitBounds(b) { this._ultimaVisao = { tipo: "bounds", b }; }
    setView(c, z) { this._ultimaVisao = { tipo: "view", c, z }; }
  }
  window.L = {
    map: (id, o) => new Mapa(id, o),
    tileLayer: () => ({ addTo() { return this; } }),
    marker: (p, o) => new Marker(p, o),
    divIcon: (o) => o,
    circleMarker: (p, o) => new CircleMarker(p, o),
    polyline: (c, o) => new Polyline(c, o),
    layerGroup: () => new Group(),
    latLngBounds: (pts) => ({ pts, isValid: () => true })
  };
})();
