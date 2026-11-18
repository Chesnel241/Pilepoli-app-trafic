import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import type { GuideStop } from '../lib/trip';
import type { GuideState } from '../lib/guide';
import { hhmm } from '../lib/trip';
import { IconCheck, IconFlag, IconWalk } from './icons';
import { colors, fonts } from '../theme';

/**
 * La voie : chaque ligne est une bande épaisse avec des traverses,
 * un petit train vu du dessus y roule, et la voie se remplit derrière lui.
 */
const MOVING_H = 96;
const TRAIN_H = 58;

/** Teinte pâle d'une couleur de ligne pour la partie de voie pas encore faite. */
function tint(hex: string, alpha = 0.22): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  const mix = (c: number) => Math.round(c * alpha + 255 * (1 - alpha));
  return `rgb(${mix(r)},${mix(g)},${mix(b)})`;
}

function Sleepers({ height }: { height: number }) {
  const count = Math.floor(height / 10);
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {Array.from({ length: count }, (_, k) => (
        <View key={k} style={{ position: 'absolute', left: 0, right: 0, top: k * 10 + 8, height: 2, backgroundColor: 'rgba(255,255,255,0.55)' }} />
      ))}
    </View>
  );
}

function Train() {
  const rock = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(rock, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.timing(rock, { toValue: 0, duration: 180, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [rock]);
  const car = (k: number, head = false) => (
    <View key={k} style={[st.car, head && st.head]}>
      <View style={st.window} />
      {head ? <View style={st.lights}><View style={st.light} /><View style={st.light} /></View> : null}
    </View>
  );
  return (
    <Animated.View accessibilityLabel="Ton train" style={{ gap: 2, alignItems: 'center', transform: [{ translateX: rock.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }) }] }}>
      {car(0)}{car(1)}{car(2, true)}
    </Animated.View>
  );
}

function MovingSegment({ color, progress, walk }: { color: string; progress: number; walk: boolean }) {
  const v = useRef(new Animated.Value(progress)).current;
  useEffect(() => {
    Animated.timing(v, { toValue: progress, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: false }).start();
  }, [progress, v]);
  const travel = walk ? MOVING_H - 26 : MOVING_H - TRAIN_H;
  const top = v.interpolate({ inputRange: [0, 1], outputRange: [0, travel] });
  if (walk) {
    return (
      <View style={[st.seg, { height: MOVING_H }]}>
        <Dots height={MOVING_H} color={colors.ink} />
        <Animated.View style={[st.walker, { top }]}><IconWalk size={15} color="#FFFFFF" /></Animated.View>
      </View>
    );
  }
  return (
    <View style={[st.seg, st.rail, { height: MOVING_H, backgroundColor: tint(color) }]}>
      <Sleepers height={MOVING_H} />
      <Animated.View style={[st.fill, { backgroundColor: color, height: Animated.add(top, TRAIN_H / 2) }]}>
        <Sleepers height={MOVING_H} />
      </Animated.View>
      <Animated.View style={{ position: 'absolute', left: 4, top }}><Train /></Animated.View>
    </View>
  );
}

function Dots({ height, color }: { height: number; color: string }) {
  return (
    <View style={{ alignItems: 'center', gap: 6, paddingTop: 4, height, overflow: 'hidden' }}>
      {Array.from({ length: Math.floor(height / 11) }, (_, k) => (
        <View key={k} style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: color }} />
      ))}
    </View>
  );
}

export function TrainTrack({ stops, state, now }: { stops: GuideStop[]; state: GuideState; now: number }) {
  return (
    <View>
      {stops.map((stop, i) => {
        const moving = state.phase === 'moving' || state.phase === 'walking';
        const passed = i < state.at || (i === state.at && moving) || state.phase === 'arrived' && i < stops.length - 1;
        const current = i === state.at && (state.phase === 'at' || state.phase === 'before' || state.phase === 'arrived');
        const isSign = i === state.signIdx;
        const segMoving = moving && i === state.at;
        const segPassed = i < state.at || state.phase === 'arrived';
        const last = i === stops.length - 1;
        const diff = Math.round((stop.at - now) / 60_000);
        const eta = current ? 'Tu y es' : diff <= 0 ? 'maintenant' : `dans ${diff} min`;
        const h = isSign ? 74 : passed ? 22 : 40;

        return (
          <View key={`${stop.name}-${i}`} style={st.row}>
            <View style={st.left}>
              <Node stop={stop} passed={passed} current={current} />
              {!last ? (
                segMoving ? (
                  <MovingSegment color={stop.color} progress={state.progress} walk={stop.walkAfter} />
                ) : stop.walkAfter ? (
                  <View style={[st.seg, { height: h }]}><Dots height={h} color={segPassed ? '#C9C9D3' : colors.ink} /></View>
                ) : (
                  <View style={[st.seg, st.rail, { height: h, backgroundColor: segPassed ? stop.color : tint(stop.color) }]}><Sleepers height={h} /></View>
                )
              ) : null}
            </View>

            <View style={[st.right, { paddingBottom: passed ? 8 : 12 }]}>
              {isSign ? (
                <View style={[st.sign, { borderBottomColor: stop.color }]}>
                  <View style={st.signHead}>
                    <Text style={st.signName}>{stop.name}</Text>
                    <Text style={st.signEta}>{eta}</Text>
                  </View>
                  {stop.tags.length ? (
                    <View style={st.tags}>
                      {stop.tags.map((t) => (
                        <View key={t} style={[st.tag, t.startsWith('Sortie') ? { backgroundColor: colors.lime } : { backgroundColor: '#2A2C33' }]}>
                          <Text style={[st.tagText, { color: t.startsWith('Sortie') ? colors.ink : '#FFFFFF' }]}>{t}</Text>
                        </View>
                      ))}
                    </View>
                  ) : null}
                </View>
              ) : passed ? (
                <View style={st.passedRow}>
                  <Text style={st.passedName}>{stop.name}</Text>
                  <Text style={st.passedTime}>{hhmm(new Date(stop.at).toISOString())}</Text>
                </View>
              ) : (
                <View style={st.plainRow}>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={st.plainName}>{stop.name}</Text>
                    {stop.tags.length ? (
                      <View style={st.tags}>
                        {stop.tags.map((t) => (
                          <View key={t} style={[st.tagLight, t.startsWith('Sortie') && { backgroundColor: colors.ink }]}>
                            <Text style={[st.tagLightText, t.startsWith('Sortie') && { color: colors.lime }]}>{t}</Text>
                          </View>
                        ))}
                      </View>
                    ) : null}
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={st.plainTime}>{hhmm(new Date(stop.at).toISOString())}</Text>
                    <Text style={st.plainEta}>{eta}</Text>
                  </View>
                </View>
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
}

function Node({ stop, passed, current }: { stop: GuideStop; passed: boolean; current: boolean }) {
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!current) return;
    const loop = Animated.loop(Animated.timing(pulse, { toValue: 1, duration: 1500, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [current, pulse]);
  if (current) {
    return (
      <View style={st.nodeWrap}>
        <Animated.View style={[st.halo, { opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }), transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.8] }) }] }]} />
        <View style={st.nodeCurrent} />
      </View>
    );
  }
  if (stop.end) return <View style={[st.nodeWrap, st.nodeEnd]}><IconFlag /></View>;
  if (passed) return <View style={[st.nodePassed, { backgroundColor: stop.color }]}><IconCheck /></View>;
  return <View style={[st.nodeNext, { borderColor: stop.color }]} />;
}

const st = StyleSheet.create({
  row: { flexDirection: 'row', gap: 14 },
  left: { width: 30, alignItems: 'center' },
  right: { flex: 1, minWidth: 0 },
  seg: { width: 26, marginVertical: -4 },
  rail: { borderRadius: 3, overflow: 'hidden' },
  fill: { position: 'absolute', left: 0, right: 0, top: 0, overflow: 'hidden' },
  car: { width: 18, height: 16, borderRadius: 3, backgroundColor: colors.ink, borderWidth: 2, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  head: { height: 20, borderBottomLeftRadius: 10, borderBottomRightRadius: 10, justifyContent: 'flex-end', paddingBottom: 2, gap: 2 },
  window: { width: 8, height: 4, borderRadius: 2, backgroundColor: '#8F7BFF' },
  lights: { flexDirection: 'row', gap: 5 },
  light: { width: 3, height: 3, borderRadius: 2, backgroundColor: colors.lime },
  walker: { position: 'absolute', left: 0, width: 26, height: 26, borderRadius: 13, backgroundColor: colors.violet, borderWidth: 2, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  nodeWrap: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center', zIndex: 3 },
  halo: { position: 'absolute', width: 30, height: 30, borderRadius: 15, backgroundColor: colors.violet },
  nodeCurrent: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.violet, borderWidth: 5, borderColor: '#FFFFFF' },
  nodeEnd: { borderRadius: 9, backgroundColor: colors.lime, borderWidth: 3, borderColor: colors.ink },
  nodePassed: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', zIndex: 3 },
  nodeNext: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#FFFFFF', borderWidth: 5, zIndex: 3 },
  sign: { marginTop: -4, padding: 12, paddingHorizontal: 14, borderRadius: 18, backgroundColor: colors.ink, borderBottomWidth: 4, gap: 8 },
  signHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 },
  signName: { fontFamily: fonts.display, fontSize: 21, color: '#FFFFFF', flexShrink: 1, lineHeight: 23 },
  signEta: { fontFamily: fonts.display, fontSize: 21, color: colors.lime },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag: { borderRadius: 8, paddingVertical: 3, paddingHorizontal: 8 },
  tagText: { fontFamily: fonts.black, fontSize: 12 },
  tagLight: { borderRadius: 8, paddingVertical: 2, paddingHorizontal: 7, backgroundColor: colors.soft },
  tagLightText: { fontFamily: fonts.bold, fontSize: 12, color: '#3A3D46' },
  passedRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 22 },
  passedName: { fontFamily: fonts.medium, fontSize: 14, color: colors.faded, textDecorationLine: 'line-through' },
  passedTime: { fontFamily: fonts.semi, fontSize: 13, color: colors.faded },
  plainRow: { flexDirection: 'row', gap: 10 },
  plainName: { fontFamily: fonts.bold, fontSize: 16, color: colors.ink },
  plainTime: { fontFamily: fonts.black, fontSize: 15, color: colors.ink },
  plainEta: { fontFamily: fonts.semi, fontSize: 12, color: colors.muted },
});
