import { useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import { angleDiff, meters, type LonLat } from './geo';
import type { Fix } from './tracker';

/**
 * Position et orientation en direct, nettoyées pour un guidage stable :
 * - les positions trop imprécises sont écartées tant qu'on a mieux et récent ;
 * - les petits sauts du GPS sont lissés (la flèche ne tremble pas) ;
 * - l'orientation vient de la boussole à l'arrêt, et du sens de la marche dès qu'on avance (plus fiable en ville).
 * Uniquement appli ouverte : jamais de suivi en arrière-plan.
 */
export interface Live {
  fix: Fix | null;
  /** Cap du téléphone (0 = nord), lissé. null si inconnu. */
  heading: number | null;
  gps: 'pending' | 'granted' | 'denied';
}

export function useLiveLocation(precise = true): Live {
  const [state, setState] = useState<Live>({ fix: null, heading: null, gps: 'pending' });
  const fixRef = useRef<Fix | null>(null);
  const headRef = useRef<number | null>(null);
  const lastPush = useRef(0);

  useEffect(() => {
    let posSub: Location.LocationSubscription | null = null;
    let headSub: Location.LocationSubscription | null = null;
    let alive = true;
    const push = (force = false) => {
      const now = Date.now();
      if (!force && now - lastPush.current < 120) return; // au plus ~8 mises à jour par seconde
      lastPush.current = now;
      if (alive) setState((s) => ({ ...s, fix: fixRef.current, heading: headRef.current }));
    };

    (async () => {
      const perm = await Location.getForegroundPermissionsAsync();
      if (!alive) return;
      if (!perm.granted) { setState((s) => ({ ...s, gps: 'denied' })); return; }
      setState((s) => ({ ...s, gps: 'granted' }));

      posSub = await Location.watchPositionAsync(
        { accuracy: precise ? Location.Accuracy.BestForNavigation : Location.Accuracy.High, distanceInterval: 2, timeInterval: 1000 },
        (pos) => {
          const p: LonLat = [pos.coords.longitude, pos.coords.latitude];
          const acc = pos.coords.accuracy ?? 50;
          const prev = fixRef.current;
          const now = Date.now();
          // Une position bien pire que la précédente, encore récente : on l'ignore.
          if (prev && acc > 65 && (prev.accuracy ?? 99) < acc && now - prev.at < 15_000) return;
          let q = p;
          if (prev && now - prev.at < 5_000) {
            const jump = meters(prev.p, p);
            // Lissage léger, plus fort quand la nouvelle mesure est moins précise ; un vrai déplacement passe tout de suite.
            const alpha = jump > 30 ? 1 : acc <= (prev.accuracy ?? acc) ? 0.7 : 0.45;
            q = [prev.p[0] + (p[0] - prev.p[0]) * alpha, prev.p[1] + (p[1] - prev.p[1]) * alpha];
          }
          const speed = pos.coords.speed !== null && pos.coords.speed >= 0 ? pos.coords.speed : null;
          fixRef.current = { p: q, accuracy: acc, speed, at: now };
          // En marche, le sens du déplacement donne le cap le plus fiable.
          const course = pos.coords.heading;
          if (speed !== null && speed > 1.3 && course !== null && course >= 0) blendHeading(course, 0.5);
          push(true);
        },
      );

      try {
        headSub = await Location.watchHeadingAsync((h) => {
          const moving = (fixRef.current?.speed ?? 0) > 1.3;
          const raw = h.trueHeading >= 0 ? h.trueHeading : h.magHeading;
          if (raw < 0 || moving) return; // en marche, on garde le cap de la trajectoire
          blendHeading(raw, 0.25);
          push();
        });
      } catch {
        /* pas de boussole : on se contentera du sens de la marche */
      }
    })().catch(() => alive && setState((s) => ({ ...s, gps: 'denied' })));

    function blendHeading(target: number, k: number) {
      const cur = headRef.current;
      headRef.current = cur === null ? target : (cur + angleDiff(target, cur) * k + 360) % 360;
    }

    return () => { alive = false; posSub?.remove(); headSub?.remove(); };
  }, [precise]);

  return state;
}
