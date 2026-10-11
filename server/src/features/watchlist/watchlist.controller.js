import { validateProjectId } from './watchlist.validation.js';
import {
  addToWatchlist,
  getWatchlist,
  removeFromWatchlist,
} from './watchlist.service.js';

export async function list(req, res) {
  const result = await getWatchlist(req.user.id);
  res.json(result);
}

export async function save(req, res) {
  const projectId = validateProjectId(req.params.projectId);
  const result = await addToWatchlist(req.user.id, projectId);
  res.json(result);
}

export async function remove(req, res) {
  const projectId = validateProjectId(req.params.projectId);
  const result = await removeFromWatchlist(req.user.id, projectId);
  res.json(result);
}
