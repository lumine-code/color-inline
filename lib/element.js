const { Disposable } = require("lumine");

// The three things this package used `atom-utils` for. That library was written
// against the v0 custom-elements API that browsers dropped years ago, and it is
// archived; there is nothing to upgrade to, so the pieces actually used are here
// instead.

// v0 named its lifecycle hooks `createdCallback` / `attachedCallback` /
// `detachedCallback`. Rather than rename them across four views, the base class
// forwards from the v1 names.
// Delegated listeners, replacing `EventsDelegation`. Called either as
// `subscribeTo(element, handlers)` or `subscribeTo(element, selector,
// handlers)`; with a selector the handler only runs for events whose target is
// inside a match, and `this` is that match.
function subscribeTo(target, selector, handlers) {
  if (handlers == null) {
    handlers = selector;
    selector = null;
  }

  const attached = [];
  for (const [event, handler] of Object.entries(handlers)) {
    const listener = (domEvent) => {
      if (!selector) return handler.call(target, domEvent);
      const match = domEvent.target.closest?.(selector);
      if (!match || !target.contains(match)) return undefined;
      return handler.call(match, domEvent);
    };
    target.addEventListener(event, listener);
    attached.push([event, listener]);
  }

  return new Disposable(() => {
    for (const [event, listener] of attached) target.removeEventListener(event, listener);
  });
}

class ColorsElement extends HTMLElement {
  constructor() {
    super();
    // SpacePenDSL built a view's `static content()` on creation, before its
    // created hook ran; keep that order so the hook still finds its outlets.
    if (typeof this.constructor.content === "function") {
      buildContent(this, this.constructor.content);
    }
    this.createdCallback?.();
  }

  connectedCallback() {
    this.attachedCallback?.();
  }

  disconnectedCallback() {
    this.detachedCallback?.();
  }

  subscribeTo(target, selector, handlers) {
    return subscribeTo(target, selector, handlers);
  }
}

// Building DOM, replacing `SpacePenDSL`. A view declares a `static content()`
// that calls these tag methods; nesting is expressed by passing a function, and
// `{outlet: 'name'}` assigns the element to `this.name` on the view.
const TAGS = [
  "a",
  "br",
  "button",
  "code",
  "div",
  "footer",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "i",
  "img",
  "input",
  "label",
  "li",
  "ol",
  "option",
  "p",
  "pre",
  "section",
  "select",
  "small",
  "span",
  "strong",
  "table",
  "tbody",
  "td",
  "th",
  "thead",
  "tr",
  "ul",
];

class DomBuilder {
  constructor() {
    this.fragment = document.createDocumentFragment();
    this.parent = this.fragment;
    this.outlets = {};

    for (const tag of TAGS) {
      this[tag] = (...args) => this.tag(tag, ...args);
    }
  }

  tag(name, ...args) {
    const element = document.createElement(name);
    let content = null;

    for (const arg of args) {
      if (typeof arg === "function") content = arg;
      else if (typeof arg === "string" || typeof arg === "number")
        element.textContent = String(arg);
      else if (arg && typeof arg === "object") this.applyAttributes(element, arg);
    }

    this.parent.appendChild(element);

    if (content) {
      const previousParent = this.parent;
      this.parent = element;
      content.call(this);
      this.parent = previousParent;
    }

    return element;
  }

  applyAttributes(element, attributes) {
    for (const [key, value] of Object.entries(attributes)) {
      if (key === "outlet") {
        this.outlets[value] = element;
        continue;
      }
      if (value == null || value === false) continue;
      element.setAttribute(key, value === true ? "" : String(value));
    }
  }

  // Escape hatch for the few places that assemble a string of markup.
  raw(html) {
    const template = document.createElement("template");
    template.innerHTML = html;
    this.parent.appendChild(template.content);
  }

  text(value) {
    this.parent.appendChild(document.createTextNode(String(value)));
  }
}

// Runs a view's `static content()` into `host`, wiring up its outlets.
function buildContent(host, content) {
  const builder = new DomBuilder();
  content.call(builder);
  host.appendChild(builder.fragment);
  Object.assign(host, builder.outlets);
  return host;
}

// `customElements.define` throws on a repeat registration, which a spec run
// reloading the package would otherwise hit.
function defineElement(name, ElementClass) {
  const existing = customElements.get(name);
  if (existing) return existing;
  customElements.define(name, ElementClass);
  return ElementClass;
}

module.exports = { ColorsElement, DomBuilder, buildContent, defineElement, subscribeTo };
