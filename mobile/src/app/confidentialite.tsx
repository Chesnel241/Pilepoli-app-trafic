import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Text } from '../components/Text';
import { IconButton } from '../components/ui';
import { IconBack } from '../components/icons';
import { useI18n } from '../lib/settings';
import { colors, fonts } from '../theme';

/**
 * Confidentialité et mentions légales, lisibles dans l'appli (même texte que engine/legal/PRIVACY.md du dépôt,
 * dont l'adresse publique sert de lien « politique de confidentialité » dans les stores).
 * Les éléments entre crochets sont à compléter avant publication.
 */
const FR: [string, string][] = [
  ['En bref', 'Pas de compte, pas de publicité, pas de traceur, pas de mesure d’audience. Pilepoil ne vend ni ne partage aucune donnée.'],
  ['Ta position', 'Elle sert à trouver les arrêts proches et à calculer ton trajet. Pour les arrêts proches, elle est arrondie à environ 100 mètres avant d’être envoyée au serveur Pilepoil. Pour le calcul du trajet, les coordonnées de départ sont transmises à Île-de-France Mobilités (API PRIM). Pilepoil ne les enregistre pas.'],
  ['Tes recherches', 'Le texte que tu tapes pour chercher une adresse est transmis à Île-de-France Mobilités pour trouver le lieu. Il n’est pas conservé par Pilepoil.'],
  ['Sur ton téléphone', 'Tes favoris, tes dernières destinations, tes réglages et le trajet en cours restent sur ton téléphone. Tu peux les effacer dans les réglages, ou en désinstallant l’appli.'],
  ['Notifications', 'Elles sont programmées sur ton téléphone au moment où tu lances un trajet. Aucun serveur de notification n’est utilisé.'],
  ['Le serveur', 'Les journaux techniques du serveur gardent une adresse IP tronquée (dernier groupe effacé), pendant 14 jours au plus, pour la sécurité et la lutte contre les abus.'],
  ['Données de transport', 'Horaires, perturbations et sorties de gare : Île-de-France Mobilités (PRIM et données ouvertes), sous leurs licences. Pilepoil est un service indépendant, non affilié à Île-de-France Mobilités.'],
  ['Éditeur', 'Chesnel EKOGHA. Contact : [adresse e-mail à compléter]. Hébergement : [hébergeur et pays à compléter].'],
  ['Tes droits', 'Pilepoil ne conserve pas de données personnelles te concernant. Pour toute question, écris à l’adresse ci-dessus. Tu peux aussi saisir la CNIL (cnil.fr).'],
];

const EN: [string, string][] = [
  ['In short', 'No account, no ads, no trackers, no analytics. Pilepoil does not sell or share any data.'],
  ['Your location', 'It is used to find nearby stops and plan your trip. For nearby stops it is rounded to about 100 metres before being sent to the Pilepoil server. For trip planning, the starting coordinates are sent to Île-de-France Mobilités (PRIM API). Pilepoil does not store them.'],
  ['Your searches', 'What you type to look up an address is sent to Île-de-France Mobilités to find the place. Pilepoil does not keep it.'],
  ['On your phone', 'Your favourites, recent destinations, settings and current trip stay on your phone. You can clear them in Settings, or by uninstalling the app.'],
  ['Notifications', 'They are scheduled on your phone when you start a trip. No notification server is used.'],
  ['The server', 'Server technical logs keep a truncated IP address (last block removed), for 14 days at most, for security and abuse prevention.'],
  ['Transport data', 'Times, disruptions and station exits: Île-de-France Mobilités (PRIM and open data), under their licences. Pilepoil is an independent service, not affiliated with Île-de-France Mobilités.'],
  ['Publisher', 'Chesnel EKOGHA. Contact: [email to be completed]. Hosting: [host and country to be completed].'],
  ['Your rights', 'Pilepoil keeps no personal data about you. For any question, write to the address above. You can also contact the CNIL (cnil.fr).'],
];

export default function Confidentialite() {
  const { t, lang } = useI18n();
  const items = lang === 'en' ? EN : FR;
  return (
    <SafeAreaView style={s.screen}>
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <IconButton label={t('common.back')} onPress={() => router.back()}><IconBack /></IconButton>
        <Text style={s.h1} accessibilityRole="header">{t('priv.title')}</Text>
        {items.map(([title, body]) => (
          <View key={title} style={{ gap: 6 }}>
            <Text style={s.h2}>{title}</Text>
            <Text style={s.body}>{body}</Text>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 40, gap: 18 },
  h1: { fontFamily: fonts.display, fontSize: 38, lineHeight: 40, color: colors.ink, letterSpacing: -1 },
  h2: { fontFamily: fonts.bold, fontSize: 17, color: colors.ink },
  body: { fontFamily: fonts.medium, fontSize: 16, lineHeight: 23, color: '#3A3D46' },
});
