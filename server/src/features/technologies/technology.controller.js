import { getAllTechnologies, requestTechnology } from './technology.service.js';

export async function getTechnologiesHandler(req, res, next) {
  try {
    const technologies = await getAllTechnologies();
    res.json({ technologies });
  } catch (error) {
    next(error);
  }
}

export async function requestTechnologyHandler(req, res, next) {
  try {
    const { name, category } = req.body || {};
    const result = await requestTechnology({
      name,
      category,
      // requireAuth's user has `id`, never `_id`; with _id no request was ever
      // attributed to anyone
      userId: req.user.id,
    });
    res.status(result.alreadyExists ? 200 : 201).json(result);
  } catch (error) {
    next(error);
  }
}

