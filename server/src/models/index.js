// Every Mongoose model is registered from this file, which src/common/db/connect.js
// imports once at boot.
//
// Mongoose resolves `ref: 'Tor'` through a single global registry at populate
// time, so a model that is only imported lazily by its own feature can still be
// unregistered when some other feature populates it — a pipeline job that runs
// before the API routes are ever touched is the usual way this bites. Importing
// them all up front removes that failure mode entirely.
//
// Models hold shape only: fields, types, indexes, and enums. Behaviour lives in
// the owning feature's service — see docs/decisions/0003-feature-based-server-layout.md.
//
// Add each model here as it lands:
//   export { Tor } from './tor.model.js';

export { User } from './user.model.js';
