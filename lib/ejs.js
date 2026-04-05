'use strict';
const fs   = require('fs');
const path = require('path');
const cache = new Map();

function escapeHtml(str) {
  if (str==null) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function compile(template) {
  let src = "'use strict';\nlet __buf=[];\nconst __e="+escapeHtml.toString()+";\n";
  const re = /<%([-=#]?)([\s\S]*?)%>/g;
  let cursor=0, match;
  while ((match=re.exec(template))!==null) {
    if (match.index>cursor) src+='__buf.push('+JSON.stringify(template.slice(cursor,match.index))+');\n';
    const type=match[1], content=match[2].trim();
    if      (!type)       src+=content+'\n';
    else if (type==='=')  src+='__buf.push(__e('+content+'));\n';
    else if (type==='-')  src+='__buf.push('+content+');\n';
    cursor=match.index+match[0].length;
  }
  if (cursor<template.length) src+='__buf.push('+JSON.stringify(template.slice(cursor))+');\n';
  src+='return __buf.join("");';
  return src;
}

function render(template, locals, viewsDir) {
  const src = compile(template);
  const merged = { allowedCards:[], allowedPages:null, user:null, title:'', ...(locals||{}) };
  // canSee: returns true if allowedPages is null (not loaded) OR pageId is in list
  merged.canSee = function(pageId) {
    if (!merged.allowedPages||!merged.allowedPages.length) return true;
    return merged.allowedPages.includes(pageId);
  };
  // hasCard: returns true if allowedCards is empty (not loaded) OR cardId is in list
  merged.hasCard = function(cardId) {
    if (!merged.allowedCards||!merged.allowedCards.length) return true;
    return merged.allowedCards.includes(cardId);
  };
  const include = function(relPath, extra) {
    const fp = path.resolve(viewsDir, relPath.endsWith('.ejs')?relPath:relPath+'.ejs');
    return render(fs.readFileSync(fp,'utf8'), Object.assign({},merged,extra||{}), path.dirname(fp));
  };
  const fn = new Function('include','locals','with(locals){\n'+src+'\n}');
  return fn(include, merged);
}

function renderFile(filePath, options, callback) {
  try {
    const viewsDir = (options&&options.settings&&options.settings.views)||path.dirname(filePath);
    let tpl;
    if (process.env.NODE_ENV==='production'&&cache.has(filePath)) { tpl=cache.get(filePath); }
    else { tpl=fs.readFileSync(filePath,'utf8'); if(process.env.NODE_ENV==='production')cache.set(filePath,tpl); }
    callback(null, render(tpl, options, viewsDir));
  } catch(err) { callback(err); }
}

module.exports = { renderFile, render, compile, escapeHtml };
