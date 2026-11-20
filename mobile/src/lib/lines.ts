import type { TrafficLevel } from './types';

/** Lignes structurantes affichées dans la grille « État du réseau » (couleurs proches des couleurs officielles). */
export const METRO = [
  ['1', '#FFCD00', '#0E0F12'], ['2', '#003CA6', '#FFFFFF'], ['3', '#837902', '#FFFFFF'], ['3bis', '#6EC4E8', '#0E0F12'],
  ['4', '#CF009E', '#FFFFFF'], ['5', '#FF7E2E', '#0E0F12'], ['6', '#6ECA97', '#0E0F12'], ['7', '#FA9ABA', '#0E0F12'],
  ['7bis', '#6ECA97', '#0E0F12'], ['8', '#E19BDF', '#0E0F12'], ['9', '#B6BD00', '#0E0F12'], ['10', '#C9910D', '#0E0F12'],
  ['11', '#704B1C', '#FFFFFF'], ['12', '#007852', '#FFFFFF'], ['13', '#6EC4E8', '#0E0F12'], ['14', '#62259D', '#FFFFFF'],
] as const;
export const RER = [
  ['A', '#E3051C', '#FFFFFF'], ['B', '#3C91DC', '#FFFFFF'], ['C', '#FFCE00', '#0E0F12'], ['D', '#00814F', '#FFFFFF'], ['E', '#C04191', '#FFFFFF'],
] as const;

export const LEVEL: Record<TrafficLevel, { label: string; bg: string; fg: string; dot: string }> = {
  ok: { label: 'Ça roule', bg: '#E7F7D9', fg: '#1F5E14', dot: '#5DB12F' },
  info: { label: 'Info', bg: '#EAF1FF', fg: '#1D4AA8', dot: '#3C7BEA' },
  travaux: { label: 'Travaux', bg: '#FFE7B0', fg: '#6B4500', dot: '#E0A000' },
  perturbe: { label: 'Perturbé', bg: '#FFE1E1', fg: '#A8191F', dot: '#D12F35' },
  interrompu: { label: 'Interrompu', bg: '#0E0F12', fg: '#FFFFFF', dot: '#D12F35' },
};

/** Normalise un mode (Métro, RER, Bus…) en clé de filtre. */
export function modeKey(mode: string, code = ''): 'metro' | 'rer' | 'tram' | 'train' | 'bus' {
  const m = mode.toLowerCase();
  // Mode inconnu (référentiel indisponible) : on devine prudemment d'après le code.
  if (!m) return /^[A-E]$/.test(code) ? 'rer' : /^T\d/.test(code) ? 'tram' : 'bus';
  if (m.includes('métro') || m.includes('metro')) return 'metro';
  if (m.includes('rer')) return 'rer';
  if (m.includes('tram')) return 'tram';
  if (m.includes('train') || m.includes('transilien') || m.includes('rail')) return /^[A-E]$/.test(code) ? 'rer' : 'train';
  return 'bus';
}
