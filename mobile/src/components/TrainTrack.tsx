import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { Text } from './Text';
import type { GuideStop } from '../lib/trip';
import type { GuideState } from '../lib/guide';
import { hhmm } from '../lib/trip';
import { colors, fonts } from '../theme';
import { isExitTip, t } from '../lib/i18n';

/**
 * Le fil du trajet, discret : les arrêts passés sont barrés,
 * le prochain « respire » doucement, les suivants s'estompent avec la distance.
 */
/**
 * `here` dit ce que l'on sait vraiment de ta position :
 * - walking : tu marches vers ce prochain arrêt (on affiche le temps de marche, pas « Tu y es ») ;
 * - at : tu y es, constaté par le GPS ;
 * - estimated : position déduite des horaires (souterrain), on ne prétend pas que tu y es.
 */
export type Here = { kind: 'walking'; minutes: number } | { kind: 'at' } | { kind: 'estimated' };

export function TrainTrack({ stops, state, now, here }: { stops: GuideStop[]; state: GuideState; now: number; here?: Here }) {
  const moving = state.phase === 'moving' || state.phase === 'walking';
  const nextIdx = state.phase === 'arrived' ? -1 : moving ? state.at + 1 : state.at;

  return (
    <View style={s.track} accessibilityLabel={t('guide.progress')}>
      {stops.map((stop, i) => {
        const passed = state.phase === 'arrived' ? i < stops.length - 1 : i < state.at || (i === state.at && moving);
        const isNext = i === nextIdx;
        const last = i === stops.length - 1;
        const ahead = i - nextIdx; // 0 = prochain, 1 = celui d'après…
        const mins = Math.round((stop.at - now) / 60_000);

        return (
          <View key={`${stop.name}-${i}`} style={s.row}>
            <View style={s.rail}>
              {isNext ? (
                <PulseNode color={stop.color} />
              ) : (
                <View style={[
                  s.node,
                  passed && { backgroundColor: colors.line, borderColor: colors.line },
                  !passed && { borderColor: stop.color },
                  last && !passed && { backgroundColor: colors.lime, borderColor: colors.ink },
                ]} />
              )}
              {!last ? (
                stop.walkAfter ? (
                  <View style={s.walkDots}>{[0, 1, 2, 3].map((k) => <View key={k} style={[s.walkDot, passed && { backgroundColor: colors.line }]} />)}</View>
                ) : (
                  <View style={[s.line, { backgroundColor: passed ? colors.line : stop.color }]} />
                )
              ) : null}
            </View>

            <View style={[s.info, !last && s.infoWithLine]}>
              {isNext ? (
                <NextStop stop={stop} mins={mins} current={!moving} here={here} />
              ) : (
                <View style={s.plain}>
                  <Text
                    style={[
                      s.name,
                      passed ? s.passedName : { fontSize: ahead === 1 ? 17 : 16, opacity: ahead > 2 ? 0.75 : 1 },
                    ]}
                    numberOfLines={1}
                  >
                    {stop.name}
                  </Text>
                  <Text style={[s.time, passed && s.passedTime]}>{hhmm(new Date(stop.at).toISOString())}</Text>
                </View>
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
}

/** Le prochain arrêt : un léger zoom qui respire, en continu. */
function NextStop({ stop, mins, current, here }: { stop: GuideStop; mins: number; current: boolean; here?: Here }) {
  const scale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(scale, { toValue: 1.04, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(scale, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [scale]);
  return (
    <Animated.View style={[s.next, { transform: [{ scale }] }]}>
      <View style={s.nextHead}>
        <Text style={s.nextName} numberOfLines={2}>{stop.name}</Text>
        <Text style={s.nextEta}>
          {here?.kind === 'walking' ? t('walk.minWalk', { n: here.minutes })
            : current ? (here?.kind === 'estimated' ? `≈ ${t('guide.nowShort')}` : t('guide.youAreThere'))
            : mins <= 0 ? t('guide.nowShort') : `${here?.kind === 'estimated' ? '≈ ' : ''}${mins} ${t('common.min')}`}
        </Text>
      </View>
      {stop.tags.length ? (
        <View style={s.tags}>
          {stop.tags.map((tag) => (
            <View key={tag} style={[s.tag, isExitTip(tag) && s.exitTag]}>
              <Text style={[s.tagText, isExitTip(tag) && s.exitTagText]}>{tag}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </Animated.View>
  );
}

function PulseNode({ color }: { color: string }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(v, { toValue: 1, duration: 1600, easing: Easing.out(Easing.quad), useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [v]);
  return (
    <View style={s.pulseWrap}>
      <Animated.View style={[s.pulseHalo, { backgroundColor: color, opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0] }), transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 2.2] }) }] }]} />
      <View style={[s.pulseDot, { backgroundColor: color }]} />
    </View>
  );
}

const s = StyleSheet.create({
  track: { paddingTop: 4 },
  row: { flexDirection: 'row', minHeight: 48 },
  rail: { width: 28, alignItems: 'center' },
  node: { width: 14, height: 14, borderRadius: 7, backgroundColor: colors.bg, borderWidth: 3, borderColor: colors.muted, marginTop: 3, zIndex: 2 },
  pulseWrap: { width: 20, height: 20, alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  pulseHalo: { position: 'absolute', width: 18, height: 18, borderRadius: 9 },
  pulseDot: { width: 18, height: 18, borderRadius: 9, borderWidth: 4, borderColor: '#FFFFFF' },
  line: { width: 3, flex: 1, marginVertical: 3, borderRadius: 2 },
  walkDots: { flex: 1, justifyContent: 'space-evenly', paddingVertical: 4 },
  walkDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.muted },
  info: { flex: 1, paddingBottom: 12, paddingLeft: 4 },
  infoWithLine: { minHeight: 48 },
  plain: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  name: { flex: 1, fontFamily: fonts.semi, fontSize: 16, color: colors.ink },
  passedName: { fontFamily: fonts.medium, fontSize: 14, color: colors.faded, textDecorationLine: 'line-through' },
  time: { fontFamily: fonts.semi, fontSize: 14, color: colors.muted },
  passedTime: { color: colors.faded, fontSize: 13 },
  next: { backgroundColor: colors.ink, borderRadius: 18, padding: 14, gap: 8, marginTop: -6, marginBottom: 4 },
  nextHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 },
  nextName: { flex: 1, fontFamily: fonts.display, fontSize: 21, lineHeight: 23, color: '#FFFFFF' },
  nextEta: { fontFamily: fonts.display, fontSize: 21, color: colors.lime },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag: { backgroundColor: '#2A2C33', borderRadius: 8, paddingVertical: 4, paddingHorizontal: 8 },
  tagText: { fontFamily: fonts.bold, fontSize: 12, color: '#FFFFFF' },
  exitTag: { backgroundColor: colors.lime },
  exitTagText: { color: colors.ink },
});
