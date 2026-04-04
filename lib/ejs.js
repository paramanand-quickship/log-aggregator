'use strict';

const fs   = require('fs');
const path = require('path');

const cache = new Map();

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function compile(template) {
  let src = "'use strict';\nlet __buf = [];\nconst __e = " + escapeHtml.toString() + ";\n";

  const re = /<%([-=#]?)([\s\S]*?)%>/g;
  let cursor = 0;
  let match;

  while ((match = re.exec(template)) !== null) {
    if (match.index > cursor) {
      src += '__buf.push(' + JSON.stringify(template.slice(cursor, match.index)) + ');\n';
    }

    const type    = match[1];
    const content = match[2].trim();

    if      (!type)         src += content + '\n';
    else if (type === '=')  src += '__buf.push(__e(' + content + '));\n';
    else if (type === '-')  src += '__buf.push(' + content + ');\n';
    // <%# comment %> -> skip

    cursor = match.index + match[0].length;
  }

  if (cursor < template.length) {
    src += '__buf.push(' + JSON.stringify(template.slice(cursor)) + ');\n';
  }

  src += 'return __buf.join("");';
  return src;
}

function render(template, locals, viewsDir) {
  const src = compile(template);

  // Build safe defaults first so include() can reference them
  const merged = {
    allowedCards: null,
    allowedPages: null,   // null = not loaded yet, canSee() returns true for all
    user:         null,
    title:        '',
  };

  // Merge incoming locals
  const incoming = locals || {};
  Object.assign(merged, incoming);

  // canSee: injected helper available in every template
  // Returns true when allowedPages is null (graceful fallback) or contains pageId
  merged.canSee = function canSee(pageId) {
    if (!merged.allowedPages || merged.allowedPages.length === 0) return true;
    return merged.allowedPages.includes(pageId);
  };

  const include = function(relPath, extraLocals) {
    const fullPath = path.resolve(
      viewsDir,
      relPath.endsWith('.ejs') ? relPath : relPath + '.ejs'
    );
    const tpl = fs.readFileSync(fullPath, 'utf8');
    return render(tpl, Object.assign({}, merged, extraLocals || {}), path.dirname(fullPath));
  };

  const fn = new Function('include', 'locals', 'with (locals) {\n' + src + '\n}');
  return fn(include, merged);
}

function renderFile(filePath, options, callback) {
  try {
    const viewsDir = (options && options.settings && options.settings.views)
      ? options.settings.views
      : path.dirname(filePath);

    let template;
    if (process.env.NODE_ENV === 'production' && cache.has(filePath)) {
      template = cache.get(filePath);
    } else {
      template = fs.readFileSync(filePath, 'utf8');
      if (process.env.NODE_ENV === 'production') cache.set(filePath, template);
    }

    callback(null, render(template, options, viewsDir));
  } catch (err) {
    callback(err);
  }
}

module.exports = { renderFile, render, compile, escapeHtml };
