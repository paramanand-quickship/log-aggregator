'use strict';
const EventEmitter = require('events');
const emitter = new EventEmitter();
emitter.setMaxListeners(500);
module.exports = emitter;
