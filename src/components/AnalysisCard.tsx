import { StyleSheet, Text, View } from 'react-native';
import type { Analysis } from '../lib/api';

const names = {
  credential_theft: '인증정보 탈취', personal_data_theft: '개인정보 탈취',
  financial_fraud: '금전 피해 유도', unsafe_installation: '위험한 설치 유도',
};

export function AnalysisCard({ analysis }: { analysis: Analysis }) {
  const dangerous = analysis.level === '위험';
  const caution = analysis.level === '주의';
  const tone = dangerous ? '#B42318' : caution ? '#9A5700' : analysis.assessment_status === 'complete' ? '#176649' : '#59657D';
  const fill = dangerous ? '#FEF0ED' : caution ? '#FFF6E5' : '#F0F5FC';
  const attacks = analysis.attack_types.filter(a => !['none', 'unknown'].includes(a.severity));
  return <View style={styles.card} accessibilityLabel="위험도 분석 결과">
    <View style={styles.row}>
      <Text style={styles.heading}>분석 결과</Text>
      <View style={[styles.badge, { backgroundColor: fill }]}><Text style={{ color: tone, fontWeight: '700', fontSize: 12 }}>
        {analysis.assessment_status === 'complete' ? '검사 완료' : analysis.assessment_status === 'partial' ? '일부 항목 미확인' : '검사 실패'}
      </Text></View>
    </View>
    <View style={styles.scoreRow}>
      <Text style={[styles.score, { color: tone }]}>{analysis.score ?? '—'}</Text>
      <View><Text style={[styles.level, { color: tone }]}>{analysis.level}</Text>
        <Text style={styles.note}>{analysis.score === null ? '점수를 산출하지 못했어요' : '100점 기준 · 악성 확률이 아니에요'}</Text></View>
    </View>
    <View style={styles.components}>
      {([['AI 행동', analysis.components.ai_behavior], ['TLS', analysis.components.tls], ['도메인 생성일', analysis.components.domain_age]] as const).map(([label, value]) =>
        <View style={styles.component} key={label}><Text style={styles.note}>{label}</Text>
          <Text style={styles.points}>{value === null ? '미평가' : value + '점'}</Text></View>)}
    </View>
    {analysis.assessment_status !== 'complete' && <Text style={styles.note}>확인한 항목만 점수에 반영했어요. 0점이어도 검사하지 못한 항목이 있을 수 있어요.</Text>}
    {attacks.length > 0 && <Text style={styles.heading}>관찰된 행동 · {attacks.map(a => names[a.type]).join(', ')}</Text>}
    {analysis.reasons.length > 0 ? analysis.reasons.map((reason, index) =>
      <Text key={reason.code + index} style={styles.reason}>• {reason.message} {reason.points > 0 ? '(+' + reason.points + ')' : ''}</Text>) :
      <Text style={styles.reason}>{analysis.assessment_status === 'complete' ? '검사 범위에서 추가 위험 신호를 찾지 못했어요.' : '현재 확인된 위험 신호는 없어요. 미확인 항목도 함께 살펴보세요.'}</Text>}
    <View style={styles.divider} />
    <Text style={styles.note}>검사한 URL</Text>
    <Text selectable numberOfLines={3} style={styles.url}>{analysis.url}</Text>
    <Text style={styles.note}>{analysis.navigation_allowed ? '사이트는 자동으로 열리지 않아요. 점수는 안전을 보장하지 않습니다.' : '보호 정책에 따라 접속 대상 검사를 차단했어요.'}</Text>
  </View>;
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#FFFFFF', borderRadius: 20, padding: 20, gap: 14, borderWidth: 1, borderColor: '#E1E8F4' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  heading: { fontSize: 15, fontWeight: '700', color: '#152443', lineHeight: 23 },
  badge: { borderRadius: 20, paddingVertical: 7, paddingHorizontal: 10 },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  score: { fontSize: 62, fontWeight: '800', lineHeight: 76 },
  level: { fontSize: 21, fontWeight: '700', marginBottom: 4 },
  note: { fontSize: 12, lineHeight: 20, color: '#61708A' },
  components: { flexDirection: 'row', borderRadius: 14, backgroundColor: '#F3F6FC', paddingVertical: 14 },
  component: { flex: 1, alignItems: 'center', gap: 4 },
  points: { fontSize: 17, fontWeight: '700', color: '#263955' },
  reason: { fontSize: 14, lineHeight: 23, color: '#314566' },
  divider: { height: 1, backgroundColor: '#E9EEF6' },
  url: { fontSize: 13, lineHeight: 21, color: '#263955' },
});
