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
      userId: req.user?._id,
    });
    res.status(result.alreadyExists ? 200 : 201).json(result);
  } catch (error) {
    next(error);
  }
}

