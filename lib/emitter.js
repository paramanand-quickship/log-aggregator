'use strict';
const EventEmitter = require('events');
const streamEmitter = new EventEmitter();
streamEmitter.setMaxListeners(500); // support many SSE clients
module.exports = streamEmitter;
