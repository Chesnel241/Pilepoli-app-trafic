/**
 * Jeton « Jeux de données » du portail PRIM (facultatif).
 * Les jeux utilisés (référentiel des lignes, accès des gares) sont en accès libre ;
 * le jeton sert seulement aux jeux à accès restreint et évite les limites de débit anonymes.
 * Format Opendatasoft : en-tête « Authorization: Apikey <jeton> ».
 */
export function datasetHeaders(): Record<string, string> {
  const token = process.env.PRIM_DATASET_TOKEN?.trim();
  return token ? { Authorization: `Apikey ${token}` } : {};
}
