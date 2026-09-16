/**
 * Trajets personnels : trajets recurrents a ne jamais proposer a la validation.
 *
 * Une regle retient deux lieux. Une trace lui correspond quand ses deux
 * extremites tombent chacune pres d'un des deux lieux, dans un sens ou dans
 * l'autre : une seule regle couvre l'aller et le retour.
 *
 * Aucune dependance : ni DOM, ni IndexedDB, ni reseau.
 */

import { haversineMeters } from '../../shared/polyline.js';

/** Meme rayon que le rapprochement avec les lieux favoris. */
export const PERSONAL_ROUTE_RADIUS_M = 200;

/** Regle construite a partir d'une trace, ou null si ses extremites sont inexploitables. */
export function routeFromTrack(track) {
  const a = spot(track?.start);
  const b = spot(track?.end);
  if (!a || !b) return null;
  // Une boucle qui revient a son depart donnerait deux lieux confondus : la
  // regle ecarterait toute boucle partant de la, tournee professionnelle
  // comprise, et sans retour possible. Au-dela de deux rayons, les deux zones
  // ne se chevauchent plus.
  if (distance(a, b) <= 2 * PERSONAL_ROUTE_RADIUS_M) return null;
  return { a, b };
}

function distance(p, q) {
  return haversineMeters([p.latitude, p.longitude], [q.latitude, q.longitude]);
}

export function matchesPersonalRoute(track, route, radius = PERSONAL_ROUTE_RADIUS_M) {
  if (!route || route.deletedAt) return false;
  const start = spot(track?.start);
  const end = spot(track?.end);
  if (!start || !end || !spot(route.a) || !spot(route.b)) return false;

  const near = (p, q) => distance(p, q) <= radius;

  return (
    (near(start, route.a) && near(end, route.b)) || (near(start, route.b) && near(end, route.a))
  );
}

export function partitionByPersonalRoutes(tracks = [], routes = [], radius = PERSONAL_ROUTE_RADIUS_M) {
  const kept = [];
  const personal = [];
  for (const track of tracks) {
    const isPersonal = routes.some((route) => matchesPersonalRoute(track, route, radius));
    (isPersonal ? personal : kept).push(track);
  }
  return { kept, personal };
}

function spot(point) {
  if (!point) return null;
  const latitude = Number(point.latitude);
  const longitude = Number(point.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { latitude, longitude, label: String(point.label || '') };
}
