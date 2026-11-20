import { StyleSheet, Text, View } from 'react-native';
import type { GuideStop } from '../lib/trip';
import type { GuideState } from '../lib/guide';
import { hhmm } from '../lib/trip';
import { colors, fonts } from '../theme';

export function TrainTrack({ stops, state }: { stops: GuideStop[]; state: GuideState; now: number }) {
  return (
    <View style={s.track} accessibilityLabel="Progression du trajet">
      {stops.map((stop, i) => {
        const moving = state.phase === 'moving' || state.phase === 'walking';
        const passed = i < state.at || (i === state.at && moving) || state.phase === 'arrived';
        const current = i === state.at && (state.phase === 'at' || state.phase === 'before');
        const last = i === stops.length - 1;

        return (
          <View key={`${stop.name}-${i}`} style={s.row}>
            <View style={s.rail}>
              <View style={[
                s.node,
                passed && { backgroundColor: stop.color, borderColor: stop.color },
                current && { backgroundColor: colors.ink, borderColor: colors.ink },
                last && { backgroundColor: colors.lime, borderColor: colors.lime },
              ]}>
                {passed ? <View style={s.nodeDot} /> : null}
              </View>
              {!last ? (
                <View style={[
                  s.line,
                  passed ? { backgroundColor: stop.color } : { backgroundColor: colors.line },
                ]} />
              ) : null}
            </View>

            <View style={[s.info, !last && s.infoWithLine]}>
              <View style={s.copy}>
                <Text style={[s.name, passed && s.passedName]} numberOfLines={1}>{stop.name}</Text>
                {current ? <Text style={s.now}>Tu y es</Text> : null}
              </View>
              <Text style={s.time}>{hhmm(new Date(stop.at).toISOString())}</Text>
              {i === state.signIdx && stop.tags.length ? (
                <View style={s.tags}>
                  {stop.tags.map((tag) => (
                    <View key={tag} style={[s.tag, tag.startsWith('Sortie') && s.exitTag]}>
                      <Text style={[s.tagText, tag.startsWith('Sortie') && s.exitTagText]}>{tag}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  track: { paddingTop: 4 },
  row: { flexDirection: 'row', minHeight: 52 },
  rail: { width: 28, alignItems: 'center' },
  node: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.bg,
    borderWidth: 3,
    borderColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  nodeDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#FFFFFF' },
  line: { width: 3, flex: 1, marginVertical: 3, borderRadius: 2 },
  info: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, paddingBottom: 12 },
  infoWithLine: { minHeight: 52 },
  copy: { flex: 1 },
  name: { fontFamily: fonts.semi, fontSize: 16, color: colors.ink },
  passedName: { color: colors.faded },
  now: { fontFamily: fonts.bold, fontSize: 12, color: colors.violet, marginTop: 2 },
  time: { fontFamily: fonts.semi, fontSize: 14, color: colors.muted },
  tags: { position: 'absolute', left: 0, right: 0, top: 24, flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag: { backgroundColor: colors.soft, borderRadius: 8, paddingVertical: 4, paddingHorizontal: 8 },
  tagText: { fontFamily: fonts.bold, fontSize: 12, color: colors.ink },
  exitTag: { backgroundColor: colors.ink },
  exitTagText: { color: colors.lime },
});
