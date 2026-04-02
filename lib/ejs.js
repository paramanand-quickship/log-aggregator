'use strict';

const fs = require('fs');
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

/**
 * Compile template → JS function body
 */
function compile(template) {
	let src = `
	'use strict';
	let __buf = [];
	const __e = ${escapeHtml.toString()};
	`;

	const re = /<%([-=#]?)([\s\S]*?)%>/g;
	let cursor = 0;
	let match;

	while ((match = re.exec(template)) !== null) {
		// Plain text
		if (match.index > cursor) {
			src += `__buf.push(${JSON.stringify(template.slice(cursor, match.index))});\n`;
		}

		const type = match[1];
		const content = match[2].trim();

		if (!type) {
			// <% code %>
			src += `${content}\n`;
		} else if (type === '=') {
			// <%= escaped %>
			src += `__buf.push(__e(${content}));\n`;
		} else if (type === '-') {
			// <%- raw %>
			src += `__buf.push(${content});\n`;
		}
		// <%# comment %> → ignore

		cursor = match.index + match[0].length;
	}

	// Remaining text
	if (cursor < template.length) {
		src += `__buf.push(${JSON.stringify(template.slice(cursor))});\n`;
	}

	src += `return __buf.join("");`;

	return src;
}

/**
 * Render template string
 */
function render(template, locals = {}, viewsDir) {
	const src = compile(template);

	// include helper
	const include = (relPath, extraLocals = {}) => {
		const fullPath = path.resolve(
			viewsDir,
			relPath.endsWith('.ejs') ? relPath : `${relPath}.ejs`
		);

		const tpl = fs.readFileSync(fullPath, 'utf8');

		return render(
			tpl,
			{ ...locals, ...extraLocals },
			path.dirname(fullPath)
		);
	};

	const keys = Object.keys(locals);
	const values = Object.values(locals);

	const fn = new Function('include', ...keys, src);

	return fn(include, ...values);
}

/**
 * Express-compatible renderer
 */
function renderFile(filePath, options = {}, callback) {
	try {
		const viewsDir =
			options.settings?.views || path.dirname(filePath);

		let template;

		if (process.env.NODE_ENV === 'production' && cache.has(filePath)) {
			template = cache.get(filePath);
		} else {
			template = fs.readFileSync(filePath, 'utf8');
			if (process.env.NODE_ENV === 'production') {
				cache.set(filePath, template);
			}
		}

		const html = render(template, options, viewsDir);

		callback(null, html);
	} catch (err) {
		callback(err);
	}
}

module.exports = { renderFile, render, escapeHtml };