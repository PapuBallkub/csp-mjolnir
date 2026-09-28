import { getOperations } from './admin.service.js';

export function readOperations(req, res) {
  res.json(getOperations());
}
