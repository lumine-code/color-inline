// Escapes a value for use inside a double-quoted HTML attribute.
const escapeAttribute = (value) =>
  String(value).replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS206: Consider reworking classes to avoid initClass
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
let [Range, CompositeDisposable, _, path] = Array.from([]);

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
    this.pathMapping = {};

    this.files = 0;
    this.colors = 0;

    this.loadingMessage.style.display = "none";

    this.subscriptions.add(
      this.subscribeTo(this, ".list-nested-item > .list-item", {
        click(e) {
          e.stopPropagation();
          const fileItem = e.target.closest(".list-nested-item");
          return fileItem.classList.toggle("collapsed");
        },
      }),
    );

    return this.subscriptions.add(
      this.subscribeTo(this, ".search-result", {
        click: (e) => {
          e.stopPropagation();
          const matchItem = e.target.closest(".search-result");

          const fileItem = matchItem.closest(".list-nested-item");
          const range = Range.fromObject([
            matchItem.dataset.start.split(",").map(Number),
            matchItem.dataset.end.split(",").map(Number),
          ]);
          const pathAttribute = fileItem.dataset.path;
          return lumine.workspace
            .open(this.pathMapping[pathAttribute])
            .then((editor) => editor.setSelectedBufferRange(range, { autoscroll: true }));
        },
      }),
    );
  }

  setModel(colorSearch) {
    this.colorSearch = colorSearch;
    this.subscriptions.add(
      this.colorSearch.onDidFindMatches((result) => {
        return this.addFileResult(result);
      }),
    );

    this.subscriptions.add(
      this.colorSearch.onDidCompleteSearch(() => {
        return this.searchComplete();
      }),
    );

    return this.colorSearch.search();
  }

  addFileResult(result) {
    this.files += 1;
    this.colors += result.matches.length;

    this.resultsList.innerHTML += this.createFileResult(result);
    return this.updateMessage();
  }

  searchComplete() {
    this.updateMessage();

    if (this.colors === 0) {
      this.pane.classList.add("no-results");
      return this.pane.appendChild(`\
<ul class='centered background-message no-results-overlay'>
  <li>No Results</li>
</ul>\
`);
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
    if (path == null) {
      path = require("path");
    }

    const { filePath, matches } = fileResult;
    const fileBasename = path.basename(filePath);

    const pathAttribute = escapeAttribute(filePath);
    this.pathMapping[pathAttribute] = filePath;
    const pathName = lumine.project.relativize(filePath);

    return `\
<li class="path list-nested-item" data-path="${pathAttribute}">
  <div class="path-details list-item">
    <span class="disclosure-arrow"></span>
    <span class="icon icon-file-text" data-name="${fileBasename}"></span>
    <span class="path-name bright">${pathName}</span>
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
  <span class="preview">
    ${prefix}
    <span class='match color-match' style='${style}'>${match.matchText}</span>
    ${suffix}
  </span>
</li>\
`;
  }
}

module.exports = defineElement("color-inline-color-results", ColorResultsElement);
