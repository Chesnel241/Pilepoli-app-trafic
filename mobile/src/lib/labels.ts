import { t } from './i18n';
import type { Anomaly, RatedDeparture } from './types';
import type { Reliability } from '../theme';

/** Libellé de fiabilité dans la langue de l'appli (le moteur envoie le sien en français, on le recompose). */
export function relLabel(r: Reliability, ageSeconds?: number | null): string {
  if (r === 'pas_vu') return ageSeconds ? t('rel.pas_vu_since', { n: Math.round(ageSeconds / 60) }) : t('rel.pas_vu');
  return t(`rel.${r}`);
}

export const depLabel = (d: Pick<RatedDeparture, 'reliability' | 'ageSeconds'>) => relLabel(d.reliability, d.ageSeconds);

/**
 * Ce que l'historique nous apprend, dit avec prudence : « d'habitude ».
 * Seulement quand l'heure affichée n'est pas déjà du temps réel frais (sinon c'est du bruit).
 */
export function predictionLabel(d: RatedDeparture): string | null {
  const p = d.prediction;
  if (!p || d.reliability === 'direct' || d.reliability === 'supprime') return null;
  const base = p.typicalDelayMin >= 1 ? t('pred.late', { n: p.typicalDelayMin })
    : p.typicalDelayMin <= -1 ? t('pred.early', { n: -p.typicalDelayMin })
    : t('pred.onTime');
  return p.badDayDelayMin >= p.typicalDelayMin + 3 ? `${base}, ${t('pred.badDay', { n: p.badDayDelayMin })}` : base;
}

export function anomalyLabel(a: Anomaly): string {
  if (a.kind === 'early') return t('anom.early', { line: a.lineCode, n: a.minutesEarly });
  if (a.kind === 'vanished') return t('anom.vanished', { line: a.lineCode });
  return t('anom.stale', { n: Math.round(a.ageSeconds / 60) });
}
