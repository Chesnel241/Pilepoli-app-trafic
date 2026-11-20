import type { IncomingMessage } from 'node:http';

/**
 * Garde-fous HTTP du moteur : limitation de débit et validation des entrées.
 * Le moteur ne gère aucun compte ni aucune donnée personnelle ; ces protections servent
 * surtout à éviter qu'un abus épuise le quota PRIM partagé par tous les voyageurs.
 */

/** Seau à jetons par adresse IP : `perMinute` requêtes par minute, avec une petite marge de rafale. */
export class RateLimiter {
  private buckets = new Map<string, { tokens: number; at: number }>();

  constructor(private perMinute: number, private burst = perMinute) {}

  allow(key: string, now = Date.now()): boolean {
    const b = this.buckets.get(key) ?? { tokens: this.burst, at: now };
    b.tokens = Math.min(this.burst, b.tokens + ((now - b.at) / 60_000) * this.perMinute);
    b.at = now;
    const ok = b.tokens >= 1;
    if (ok) b.tokens -= 1;
    this.buckets.set(key, b);
    // Ménage : on ne garde pas les adresses au-delà de quelques minutes d'inactivité.
    if (this.buckets.size > 10_000) {
      for (const [k, v] of this.buckets) if (now - v.at > 5 * 60_000) this.buckets.delete(k);
    }
    return ok;
  }
}

/**
 * Adresse du client. Derrière Nginx, l'adresse réelle est dans X-Forwarded-For :
 * on ne la croit que si TRUST_PROXY=1 (sinon n'importe qui pourrait la falsifier).
 */
export function clientIp(req: IncomingMessage, trustProxy: boolean): string {
  if (trustProxy) {
    const xff = req.headers['x-forwarded-for'];
    const first = (Array.isArray(xff) ? xff[0] : xff)?.split(',')[0]?.trim();
    if (first) return first;
  }
  return req.socket.remoteAddress ?? 'inconnu';
}

/** Identifiants d'arrêt SIRI ou Navitia : lettres, chiffres et : _ - . seulement. */
const REF = /^[A-Za-z0-9:_\-.]{1,96}$/;
export const isRef = (v: string | null): v is string => !!v && REF.test(v);

/** Point de départ ou d'arrivée : un identifiant Navitia, ou « lon;lat ». */
const COORD = /^-?\d{1,3}(\.\d{1,8})?;-?\d{1,2}(\.\d{1,8})?$/;
export const isEndpoint = (v: string | null): v is string => !!v && (REF.test(v) || COORD.test(v));

/** Texte de recherche : longueur bornée, pas de caractères de contrôle. */
export function cleanQuery(v: string | null): string | null {
  if (!v) return null;
  const q = v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  return q.length >= 2 && q.length <= 100 ? q : null;
}

/** Coordonnées valides (on laisse passer hors Île-de-France : Navitia répondra simplement vide). */
export function coords(lon: string | null, lat: string | null): { lon: number; lat: number } | null {
  const x = Number(lon), y = Number(lat);
  if (!Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x) > 180 || Math.abs(y) > 90) return null;
  return { lon: x, lat: y };
}

/** Petit cache mémoire à durée de vie, borné en taille. */
export class TtlCache<T> {
  private map = new Map<string, { at: number; value: T }>();
  constructor(private ttlMs: number, private max = 2000) {}

  get(key: string, now = Date.now()): T | undefined {
    const hit = this.map.get(key);
    if (!hit) return undefined;
    if (now - hit.at > this.ttlMs) { this.map.delete(key); return undefined; }
    return hit.value;
  }

  set(key: string, value: T, now = Date.now()): void {
    if (this.map.size >= this.max) this.map.delete(this.map.keys().next().value as string);
    this.map.set(key, { at: now, value });
  }

  /** Renvoie la valeur en cache, ou la calcule une seule fois même si plusieurs requêtes arrivent ensemble. */
  private inflight = new Map<string, Promise<T>>();
  async wrap(key: string, compute: () => Promise<T>): Promise<T> {
    const hit = this.get(key);
    if (hit !== undefined) return hit;
    const running = this.inflight.get(key);
    if (running) return running;
    const p = compute().then((v) => { this.set(key, v); return v; }).finally(() => this.inflight.delete(key));
    this.inflight.set(key, p);
    return p;
  }
}
