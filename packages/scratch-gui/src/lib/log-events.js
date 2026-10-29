/* S-LLM, 2026-10-29. AGPL-3.0-only.
 * Adapt the MIT-licensed events module for minilog's pipe/unpipe protocol.
 */
const {EventEmitter} = require('events');

class LogEvents extends EventEmitter {
    on (event, listener) {
        return this.prependListener(event, listener);
    }
    once (event, listener) {
        return this.prependOnceListener(event, listener);
    }
    emit (event, ...args) {
        super.emit(event, ...args);
        return this;
    }
    when (event, predicate) {
        const handler = (...args) => {
            if (predicate.apply(this, args)) this.removeListener(event, handler);
        };
        return this.on(event, handler);
    }
    static mixin (Target) {
        for (const prototype of [EventEmitter.prototype, LogEvents.prototype]) {
            for (const name of Object.getOwnPropertyNames(prototype)) {
                if (name === 'constructor') continue;
                const descriptor = Object.getOwnPropertyDescriptor(prototype, name);
                if (typeof descriptor.value === 'function') Target.prototype[name] = descriptor.value;
            }
        }
    }
}

module.exports = LogEvents;
