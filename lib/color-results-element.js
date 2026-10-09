const escapeText = (value) =>
  String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
// Escapes a value for use inside a double-quoted HTML attribute.
const escapeAttribute = (value) => escapeText(value).replace(/"/g, "&quot;");

/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS206: Consider reworking classes to avoid initClass
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
let [Range, CompositeDisposable, _] = Array.from([]);

const { ColorInlineElement, defineElement } = require("./element");

const removeLeadingWhitespace = (string) => string.replace(/^\s+/, "");

class ColorResultsElement extends ColorInlineElement {
  static content() {
    return this.tag("lumine-panel", { outlet: "pane", class: "preview-pane pane-item" }, () => {
      this.div({ class: "panel-heading" }, () => {
        this.span({ outlet: "previewCount", class: "preview-count inline-block" });
        return this.div({ outlet: "loadingMessage", class: "inline-block" }, () => {
          this.div({ class: "loading loading-spinner-tiny inline-block" });
          return this.div({ outlet: "searchedCountBlock", class: "inline-block" }, () => {
            this.span({ outlet: "searchedCount", class: "searched-count" });
            return this.span(" paths searched");
          });
        });
      });

      return this.ol({
        outlet: "resultsList",
        class:
          "search-color-inline-results results-view list-tree focusable-panel has-collapsable-children native-key-bindings",
        tabindex: -1,
      });
    });
  }

  createdCallback() {
    if (CompositeDisposable == null) {
      ({ Range, CompositeDisposable } = require("lumine"));
    }

    this.subscriptions = new CompositeDisposable();
    this.iconSubscriptions = new CompositeDisposable();
    this.pathMapping = {};

    this.files = 0;
    this.colors = 0;

    this.loadingMessage.style.display = "none";

    return this.bindDOMEvents();
  }

  bindDOMEvents() {
    const subscriptions = (this.eventSubscriptions = new CompositeDisposable());

    subscriptions.add(
      this.subscribeTo(this, ".list-nested-item > .list-item", {
        click(e) {
          e.stopPropagation();
          const fileItem = e.target.closest(".list-nested-item");
          return fileItem.classList.toggle("collapsed");
        },
      }),
    );

    return subscriptions.add(
      this.subscribeTo(this, ".search-result", {
        click: (e) => {
          if (this.destroyed) return;
          e.stopPropagation();
          const matchItem = e.target.closest(".search-result");

          const fileItem = matchItem.closest(".list-nested-item");
          const range = Range.fromObject([
            matchItem.dataset.start.split(",").map(Number),
            matchItem.dataset.end.split(",").map(Number),
          ]);
          const pathAttribute = fileItem.dataset.path;
          const owner = this.subscriptions;
          const model = this.colorSearch;
          return lumine.workspace.open(this.pathMapping[pathAttribute]).then((editor) => {
            if (
              !this.destroyed &&
              this.subscriptions === owner &&
              this.colorSearch === model &&
              editor != null &&
              !editor.isDestroyed?.() &&
              typeof editor.setSelectedBufferRange === "function"
            ) {
              editor.setSelectedBufferRange(range, { autoscroll: true });
            }
          });
        },
      }),
    );
  }

  setModel(colorSearch) {
    if (this.destroyed) return;
    const previous = this.subscriptions;
    const subscriptions = (this.subscriptions = new CompositeDisposable());
    this.colorSearch = colorSearch;
    previous.dispose();
    const current = () =>
      !this.destroyed && this.subscriptions === subscriptions && this.colorSearch === colorSearch;
    if (!current()) return;
    this.resetResults();
    if (!current()) return;
    subscriptions.add(
      colorSearch.onDidFindMatches((result) => {
        if (current()) return this.addFileResult(result);
      }),
    );

    subscriptions.add(
      colorSearch.onDidCompleteSearch(() => {
        if (current()) return this.searchComplete();
      }),
      colorSearch.onDidStartSearch(() => {
        if (current()) this.resetResults();
      }),
      colorSearch.onDidDestroy(() => {
        if (current()) this.destroy();
      }),
    );

    return colorSearch.search();
  }

  resetResults() {
    const icons = this.iconSubscriptions;
    this.iconSubscriptions = new CompositeDisposable();
    this.pathMapping = {};
    this.files = this.colors = 0;
    this.resultsList.replaceChildren();
    this.pane.querySelectorAll(".no-results-overlay").forEach((overlay) => overlay.remove());
    this.pane.classList.remove("no-results");
    icons.dispose();
    this.updateMessage();
  }

  addFileResult(result) {
    if (this.destroyed) return;
    this.files += 1;
    this.colors += result.matches.length;

    this.resultsList.insertAdjacentHTML("beforeend", this.createFileResult(result));
    const icon = this.resultsList.lastElementChild?.querySelector(".color-result-file-icon");
    if (icon) {
      const owner = this.iconSubscriptions;
      const resource = lumine.icons.applyTo(
        icon,
        { path: result.filePath, context: "color-inline", hints: { directory: false } },
        { setData: false },
      );
      if (this.destroyed || this.iconSubscriptions !== owner || owner.disposed) {
        resource.dispose();
        return;
      }
      owner.add(resource);
    }
    return this.updateMessage();
  }

  detachedCallback() {
    this.eventSubscriptions.dispose();
  }

  attachedCallback() {
    if (!this.destroyed && this.eventSubscriptions.disposed) this.bindDOMEvents();
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.eventSubscriptions.dispose();
    this.subscriptions.dispose();
    this.iconSubscriptions.dispose();
  }

  searchComplete() {
    if (this.destroyed) return;
    this.updateMessage();

    if (this.colors === 0) {
      this.pane.classList.add("no-results");
      const overlay = document.createElement("ul");
      overlay.className = "centered background-message no-results-overlay";
      const message = document.createElement("li");
      message.textContent = "No Results";
      overlay.appendChild(message);
      return this.pane.appendChild(overlay);
    }
  }

  updateMessage() {
    const filesString = this.files === 1 ? "file" : "files";

    return (this.previewCount.innerHTML =
      this.colors > 0
        ? `\
<span class='text-info'>
  ${this.colors} colors
</span>
found in
<span class='text-info'>
  ${this.files} ${filesString}
</span>\
`
        : `No colors found in ${this.files} ${filesString}`);
  }

  createFileResult(fileResult) {
    const { filePath, matches } = fileResult;
    const pathAttribute = escapeAttribute(filePath);
    this.pathMapping[filePath] = filePath;
    const pathName = lumine.project.relativize(filePath);

    return `\
<li class="path list-nested-item" data-path="${pathAttribute}">
  <div class="path-details list-item">
    <span class="disclosure-arrow"></span>
    <span class="color-result-file-icon"></span>
    <span class="path-name bright">${escapeText(pathName)}</span>
    <span class="path-match-number">(${matches.length})</span></div>
  </div>
  <ul class="matches list-tree">
    ${matches.map((match) => this.createMatchResult(match)).join("")}
  </ul>
</li>`;
  }

  createMatchResult(match) {
    if (CompositeDisposable == null) {
      ({ Range, CompositeDisposable } = require("lumine"));
    }

    const textColor = match.color.luma > 0.43 ? "black" : "white";

    let { range } = match;

    range = Range.fromObject(range);
    const matchStart = range.start.column - match.lineTextOffset;
    const matchEnd = range.end.column - match.lineTextOffset;
    const prefix = removeLeadingWhitespace(match.lineText.slice(0, matchStart));
    const suffix = match.lineText.slice(matchEnd);
    const lineNumber = range.start.row + 1;
    let style = "";
    style += `background: ${match.color.toCSS()};`;
    style += `color: ${textColor};`;

    return `\
<li class="search-result list-item" data-start="${range.start.row},${range.start.column}" data-end="${range.end.row},${range.end.column}">
  <span class="line-number text-subtle">${lineNumber}</span>
  <span class="preview">${escapeText(prefix)}<span class='match color-match' style='${style}'>${escapeText(match.matchText)}</span>${escapeText(suffix)}</span>
</li>\
`;
  }
}

module.exports = defineElement("color-inline-color-results", ColorResultsElement);
