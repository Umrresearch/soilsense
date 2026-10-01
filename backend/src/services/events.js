import { EventEmitter } from 'node:events';

/**
 * In-process pub/sub used to push new readings & recommendations to
 * connected browsers over Server-Sent Events.
 * (Single instance is fine for free hosting; swap for Postgres LISTEN/NOTIFY
 *  or Redis if you ever run more than one backend instance.)
 */
export const bus = new EventEmitter();
bus.setMaxListeners(1000);

export const publish = (farmerId, type, data) => bus.emit(`farmer:${farmerId}`, { type, data });
