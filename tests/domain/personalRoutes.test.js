import { describe, it, expect } from 'vitest';
import {
  PERSONAL_ROUTE_RADIUS_M,
  routeFromTrack,
  matchesPersonalRoute,
  partitionByPersonalRoutes,
} from '../../src/domain/tracks/personalRoutes.js';

// Lieux fictifs, ~1,1 km d'ecart en latitude.
const HOME = { latitude: 45.1, longitude: 5.1, label: 'Maison' };
const GYM = { latitude: 45.11, longitude: 5.1, label: 'Salle de sport' };
const WORK = { latitude: 45.2, longitude: 5.3, label: 'Bureau' };

const track = (start, end, id = 't') => ({ id, start, end, status: 'pending' });
// ~100 m au nord : dans le rayon.
const near = (p) => ({ ...p, latitude: p.latitude + 0.0009 });
// ~330 m au nord : hors rayon.
const far = (p) => ({ ...p, latitude: p.latitude + 0.003 });

describe('routeFromTrack', () => {
  it('reprend les deux extremites et leurs libelles', () => {
    const route = routeFromTrack(track(HOME, GYM));
    expect(route.a).toEqual({ latitude: 45.1, longitude: 5.1, label: 'Maison' });
    expect(route.b).toEqual({ latitude: 45.11, longitude: 5.1, label: 'Salle de sport' });
  });

  it('refuse une boucle qui revient a son point de depart', () => {
    // Une telle regle ecarterait toute boucle partant de ce lieu, y compris
    // une tournee professionnelle — sans retour possible.
    expect(routeFromTrack(track(HOME, near(HOME)))).toBeNull();
    expect(routeFromTrack(track(HOME, { ...HOME, latitude: HOME.latitude + 0.0035 }))).toBeNull();
  });

  it('refuse une trace sans coordonnees exploitables', () => {
    expect(routeFromTrack(track(null, GYM))).toBeNull();
    expect(routeFromTrack(track({ latitude: NaN, longitude: 5 }, GYM))).toBeNull();
  });
});

describe('matchesPersonalRoute', () => {
  const route = routeFromTrack(track(HOME, GYM));

  it('reconnait le meme trajet', () => {
    expect(matchesPersonalRoute(track(HOME, GYM), route)).toBe(true);
  });

  it('reconnait le trajet retour avec la meme regle', () => {
    expect(matchesPersonalRoute(track(GYM, HOME), route)).toBe(true);
  });

  it('tolere un ecart GPS dans le rayon', () => {
    expect(matchesPersonalRoute(track(near(HOME), near(GYM)), route)).toBe(true);
  });

  it('ne reconnait pas un point hors rayon', () => {
    expect(matchesPersonalRoute(track(far(HOME), GYM), route)).toBe(false);
  });

  it('exige les DEUX extremites : un seul lieu commun ne suffit pas', () => {
    expect(matchesPersonalRoute(track(HOME, WORK), route)).toBe(false);
    expect(matchesPersonalRoute(track(WORK, GYM), route)).toBe(false);
  });

  it('ignore une regle supprimee', () => {
    const deleted = { ...route, deletedAt: '2026-09-16T10:00:00.000Z' };
    expect(matchesPersonalRoute(track(HOME, GYM), deleted)).toBe(false);
  });

  it('expose le rayon retenu', () => {
    expect(PERSONAL_ROUTE_RADIUS_M).toBe(200);
  });
});

describe('partitionByPersonalRoutes', () => {
  it('separe les trajets personnels des autres, sans perdre l’ordre', () => {
    const route = routeFromTrack(track(HOME, GYM));
    const tracks = [track(HOME, WORK, '1'), track(GYM, HOME, '2'), track(WORK, HOME, '3')];

    const { kept, personal } = partitionByPersonalRoutes(tracks, [route]);

    expect(kept.map((t) => t.id)).toEqual(['1', '3']);
    expect(personal.map((t) => t.id)).toEqual(['2']);
  });

  it('garde tout quand il n’y a aucune regle', () => {
    const tracks = [track(HOME, GYM, '1')];
    expect(partitionByPersonalRoutes(tracks, []).kept).toHaveLength(1);
  });
});
