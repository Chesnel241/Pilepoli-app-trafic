import type { LegMode } from '../lib/types';

/**
 * Fichiers Lottie facultatifs, un par mode de transport.
 * Par défaut c'est vide : l'appli utilise ses propres animations (components/ModeAnimation.tsx).
 *
 * Pour utiliser une animation Lottie dont tu as la licence (par exemple un pack acheté sur LottieFiles) :
 * 1. Exporte-la en JSON (Lottie) et place-la dans mobile/assets/lottie/, par exemple metro.json.
 * 2. Ajoute une ligne ci-dessous :   metro: require('../../assets/lottie/metro.json'),
 * Conseil : choisis des animations sur fond transparent, en boucle, de moins de 100 Ko.
 */
export const LOTTIE: Partial<Record<LegMode, unknown>> = {
  // metro: require('../../assets/lottie/metro.json'),
  // rer: require('../../assets/lottie/train.json'),
  // train: require('../../assets/lottie/train.json'),
  // tram: require('../../assets/lottie/tram.json'),
  // bus: require('../../assets/lottie/bus.json'),
  // cable: require('../../assets/lottie/telepherique.json'),
  // boat: require('../../assets/lottie/ferry.json'),
};
