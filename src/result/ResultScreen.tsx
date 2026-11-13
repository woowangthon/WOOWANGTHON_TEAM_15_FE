import { useState } from 'react';
import { Alert, Linking, Platform, Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';

import type { AnalyzeOutcome, PhotoNote } from '../api/analyze';
import type { AnalyzeResponse } from '../api/types';
import { buildVerdict, type CheckTone, type Tone } from './verdict';

const TONE_COLORS: Record<Tone, { bg: string; fg: string; border: string }> = {
  danger: { bg: '#FDECEC', fg: '#B42318', border: '#F5B5B0' },
  caution: { bg: '#FFF4E0', fg: '#9A5B00', border: '#F7CF8A' },
  unknown: { bg: '#EEF1F6', fg: '#3D4A63', border: '#C9D1DE' },
  low: { bg: '#E7F6EE', fg: '#1D6B43', border: '#A9DCC0' },
};
const CHECK_MARKS: Record<CheckTone, { mark: string; color: string; label: string }> = {
  danger: { mark: '!', color: '#B42318', label: '위험' },
  caution: { mark: '!', color: '#B26A00', label: '주의' },
  ok: { mark: '✓', color: '#1D6B43', label: '이상 없음' },
  unknown: { mark: '?', color: '#6B778C', label: '확인 불가' },
  info: { mark: 'i', color: '#2256CF', label: '참고' },
};

type Props = { outcome: AnalyzeOutcome; onRescan: () => void };

export function ResultScreen({ outcome, onRescan }: Props) {
  return outcome.kind === 'analysis'
    ? <AnalysisResult data={outcome.data} brandTexts={outcome.brandTexts} photo={outcome.photo} onRescan={onRescan} />
    : <SimpleResult outcome={outcome} onRescan={onRescan} />;
}

// Pinned app-style header (outside the ScrollView): thin chevron back button on the left (drawn, no icon font), title centered.
// Goes back to the QR input screen without opening anything.
function BackButton({ onPress }: { onPress: () => void }) {
  return (
    <View style={styles.header}>
      <Pressable accessibilityRole="button" accessibilityLabel="뒤로 가기" hitSlop={8} onPress={onPress}
        style={({ pressed }) => [styles.back, pressed && styles.backPressed]}>
        <View style={styles.chevron} />
      </Pressable>
      <Text style={styles.headerTitle} accessibilityRole="header">검사 결과</Text>
      <View style={styles.back} />
    </View>
  );
}

// Shown only when the QR photo was sent (photoAssist on): what it found, that it found nothing, or why it was skipped.
function PhotoCard({ photo }: { photo: PhotoNote }) {
  let body: string;
  if (photo.kind === 'found') {
    const parts = [
      `사진 속 상표 후보: ${photo.brands.join(', ')}`,
      photo.usedBrand ? `사용자가 확인한 상표: ${photo.usedBrand}` : '사진 속 후보는 검사에 사용하지 않았어요.',
    ].filter(Boolean);
    body = parts.join('\n');
  } else if (photo.kind === 'none') {
    body = '사진에서 등록된 상표명을 찾지 못했어요. 상표를 별도로 입력하지 않았다면 상표 비교는 수행하지 않았어요.';
  } else {
    body = `사진에서 상표 찾기를 건너뛰었어요. ${photo.reason} QR 주소 검사는 그대로 했어요.`;
  }
  return (
    <View style={styles.card}>
      <Text style={styles.heading}>사진에서 찾은 정보</Text>
      <Text style={photo.kind === 'found' ? styles.reason : styles.aiNote}>{body}</Text>
    </View>
  );
}

function AnalysisResult({ data, brandTexts, photo, onRescan }: { data: AnalyzeResponse; brandTexts: string[]; photo?: PhotoNote; onRescan: () => void }) {
  const verdict = buildVerdict(data, brandTexts);
  const colors = TONE_COLORS[verdict.tone];
  const [showDetails, setShowDetails] = useState(verdict.tone !== 'low');

  return (
    <View style={styles.page}>
      <BackButton onPress={onRescan} />
      <ScrollView contentContainerStyle={styles.content}>
      <View style={[styles.banner, { backgroundColor: colors.bg, borderColor: colors.border }]} accessibilityRole="summary">
        <Text style={[styles.bannerTitle, { color: colors.fg }]}>{verdict.title}</Text>
        <Text style={[styles.bannerSummary, { color: colors.fg }]}>{verdict.summary}</Text>
        <Text style={styles.score}>
          위험 점수 {verdict.score === null ? '산출 불가' : `${verdict.score}점`}
          <Text style={styles.scoreNote}>  {data.verdict ? '(주소·상표·페이지 내용·인증서·도메인 종합)' : '(AI 내용 분석·인증서·도메인 생성일 기준)'}</Text>
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.heading}>QR 속 주소</Text>
        <Text selectable style={styles.url}>{data.url}</Text>
        {verdict.finalUrl && <>
          <Text style={styles.subheading}>실제로 이동하는 주소</Text>
          <Text selectable style={styles.url}>{verdict.finalUrl}</Text>
        </>}
        <Text style={styles.note}>주소는 글자로만 보여주고, 사이트는 열지 않았어요.</Text>
      </View>

      {photo && <PhotoCard photo={photo} />}

      {(data.explanation_status === 'generated' || data.explanation_status === 'cached') && data.explanation ? (
        <View style={styles.card}>
          <Text style={styles.heading}>AI 설명</Text>
          <Text style={styles.reason}>{data.explanation}</Text>
          <Text style={styles.aiNote}>AI가 검사 결과를 쉽게 풀어 쓴 설명이에요. 판정은 위 검사 결과를 따라요.</Text>
        </View>
      ) : (data.explanation_status === 'skipped' || data.explanation_status === 'unavailable') && data.explanation_skip_reason ? (
        <View style={styles.card}>
          <Text style={styles.heading}>AI 설명</Text>
          <Text style={styles.aiNote}>{data.explanation_skip_reason}</Text>
        </View>
      ) : null}

      {verdict.reasons.length > 0 && <View style={styles.card}>
        <Text style={styles.heading}>이렇게 판단했어요</Text>
        {verdict.reasons.map((reason) => (
          <Text key={reason} style={styles.reason}>• {reason}</Text>
        ))}
      </View>}

      <View style={styles.card}>
        <Pressable accessibilityRole="button" onPress={() => setShowDetails((v) => !v)} style={styles.detailsToggle}>
          <Text style={styles.heading}>검사 항목 {verdict.checks.length}개</Text>
          <Text style={styles.toggleText}>{showDetails ? '접기' : '펼치기'}</Text>
        </Pressable>
        {showDetails && verdict.checks.map((check) => {
          const mark = CHECK_MARKS[check.tone];
          return (
            <View key={check.key} style={styles.checkRow} accessible accessibilityLabel={`${check.label}: ${mark.label}. ${check.detail}`}>
              <View style={[styles.checkMark, { borderColor: mark.color }]}>
                <Text style={[styles.checkMarkText, { color: mark.color }]}>{mark.mark}</Text>
              </View>
              <View style={styles.checkBody}>
                <Text style={styles.checkLabel}>{check.label} <Text style={{ color: mark.color }}>· {mark.label}</Text></Text>
                <Text style={styles.checkDetail}>{check.detail}</Text>
              </View>
            </View>
          );
        })}
        {showDetails && (
          <Text style={styles.attribution}>
            This product includes GeoLite2 data created by MaxMind, available from https://www.maxmind.com
          </Text>
        )}
      </View>

      <Text style={styles.disclaimer}>
        이 결과는 자동 검사 결과이며 안전을 보장하지 않아요. 비밀번호·카드번호·인증번호는 QR로 연 사이트에 입력하지 않는 게 좋아요.
      </Text>

      <Pressable accessibilityRole="button" style={styles.primary} onPress={onRescan}>
        <Text style={styles.primaryText}>접속하지 않고 다시 스캔하기</Text>
      </Pressable>
      {verdict.canOpen
        ? <OpenAnyway url={data.url} tone={verdict.tone} />
        : <Text style={styles.note}>검사 서버가 위험한 이동을 막은 주소라 이 앱에서는 열 수 없어요.</Text>}
      </ScrollView>
    </View>
  );
}

function OpenAnyway({ url, tone }: { url: string; tone: Tone }) {
  const [asked, setAsked] = useState(false);

  async function open() {
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert('주소를 열지 못했어요.');
    }
  }

  function confirm() {
    const title = tone === 'danger' ? '위험한 주소예요. 정말 접속할까요?' : '이 주소로 접속할까요?';
    const message = `${url}\n\n접속한 뒤 개인정보·결제 정보를 입력하지 않도록 주의하세요.`;
    if (Platform.OS === 'web') {
      // react-native-web's Alert has no buttons.
      if (window.confirm(`${title}\n\n${message}`)) void open();
      return;
    }
    Alert.alert(title, message, [
      { text: '취소', style: 'cancel' },
      { text: tone === 'danger' ? '위험을 알고 접속' : '접속', style: 'destructive', onPress: () => void open() },
    ]);
  }

  // Two steps on purpose: first reveal the question, then a system confirm dialog.
  if (!asked) {
    return (
      <Pressable accessibilityRole="button" style={styles.textButton} onPress={() => setAsked(true)}>
        <Text style={styles.textButtonText}>그래도 접속하시겠어요?</Text>
      </Pressable>
    );
  }
  return (
    <View style={styles.askCard}>
      <Text style={styles.askText}>
        {tone === 'danger'
          ? '위험 신호가 있는 주소예요. 접속하면 개인정보나 돈을 잃을 수 있어요.'
          : '접속은 직접 선택하는 거예요. 사이트가 요구하는 정보를 신중히 확인해 주세요.'}
      </Text>
      <Pressable accessibilityRole="button" style={[styles.openButton, tone === 'danger' && styles.openDanger]} onPress={confirm}>
        <Text style={[styles.openText, tone === 'danger' && styles.openDangerText]}>브라우저에서 열기</Text>
      </Pressable>
      <Pressable accessibilityRole="button" style={styles.textButton} onPress={() => setAsked(false)}>
        <Text style={styles.textButtonText}>취소</Text>
      </Pressable>
    </View>
  );
}

function SimpleResult({ outcome, onRescan }: { outcome: Exclude<AnalyzeOutcome, { kind: 'analysis' }>; onRescan: () => void }) {
  const notUrl = outcome.kind === 'not_url';
  const colors = TONE_COLORS.unknown;
  return (
    <View style={styles.page}>
      <BackButton onPress={onRescan} />
      <ScrollView contentContainerStyle={styles.content}>
      <View style={[styles.banner, { backgroundColor: colors.bg, borderColor: colors.border }]}>
        <Text style={[styles.bannerTitle, { color: colors.fg }]}>{notUrl ? '웹 주소가 아니에요' : '검사하지 못했어요'}</Text>
        <Text style={[styles.bannerSummary, { color: colors.fg }]}>
          {notUrl ? 'QR에 웹사이트 주소가 아닌 글자가 들어 있어요. 이 앱은 http/https 주소만 검사해요.' : outcome.message}
        </Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.heading}>QR 원본 내용</Text>
        <Text selectable style={styles.url}>{outcome.raw === '' ? '(빈 내용)' : outcome.raw}</Text>
        {!notUrl && <Text style={styles.note}>검사가 끝나지 않은 주소는 열지 않는 게 안전해요.</Text>}
      </View>
      <Pressable accessibilityRole="button" style={styles.primary} onPress={onRescan}>
        <Text style={styles.primaryText}>다시 스캔하기</Text>
      </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 48, gap: 14, width: '100%', maxWidth: 620, alignSelf: 'center' },
  // No safe-area library in this project: status bar height on Android, notch allowance on iOS.
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingBottom: 6,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) + 6 : 50,
    backgroundColor: '#F3F6FC', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#DCE2EC',
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#152443' },
  back: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  backPressed: { backgroundColor: '#E4E9F2' },
  // A square with two borders, rotated 45° → a thin "‹" chevron like iOS/Toss/Kakao back buttons.
  chevron: { width: 12, height: 12, borderLeftWidth: 2.5, borderBottomWidth: 2.5, borderColor: '#152443', transform: [{ rotate: '45deg' }], marginLeft: 4 },
  banner: { borderWidth: 1, borderRadius: 18, padding: 20, gap: 8 },
  bannerTitle: { fontSize: 28, fontWeight: '800' },
  bannerSummary: { fontSize: 17, lineHeight: 25, fontWeight: '600' },
  score: { marginTop: 4, fontSize: 14, fontWeight: '700', color: '#263955' },
  scoreNote: { fontSize: 12, fontWeight: '400', color: '#52617B' },
  card: { padding: 18, gap: 10, borderRadius: 18, backgroundColor: '#FFFFFF' },
  heading: { fontSize: 16, fontWeight: '700', color: '#152443' },
  subheading: { fontSize: 14, fontWeight: '700', color: '#152443', marginTop: 4 },
  url: { fontSize: 15, lineHeight: 22, color: '#263955', fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }) },
  note: { fontSize: 13, lineHeight: 20, color: '#52617B', textAlign: 'center' },
  reason: { fontSize: 15, lineHeight: 23, color: '#263955' },
  aiNote: { fontSize: 12, lineHeight: 18, color: '#6B778C' },
  attribution: { fontSize: 11, lineHeight: 16, color: '#8A94A6', paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#DCE2EC' },
  detailsToggle: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 32 },
  toggleText: { fontSize: 14, fontWeight: '700', color: '#2256CF' },
  checkRow: { flexDirection: 'row', gap: 12, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#DCE2EC' },
  checkMark: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  checkMarkText: { fontSize: 14, fontWeight: '800' },
  checkBody: { flex: 1, gap: 2 },
  checkLabel: { fontSize: 15, fontWeight: '700', color: '#152443' },
  checkDetail: { fontSize: 14, lineHeight: 21, color: '#465570' },
  disclaimer: { fontSize: 13, lineHeight: 20, color: '#52617B', paddingHorizontal: 4 },
  primary: { backgroundColor: '#2256CF', borderRadius: 14, padding: 17, alignItems: 'center', minHeight: 52 },
  primaryText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  textButton: { alignItems: 'center', padding: 12, minHeight: 44 },
  textButtonText: { color: '#52617B', fontSize: 15, fontWeight: '600', textDecorationLine: 'underline' },
  askCard: { padding: 18, gap: 10, borderRadius: 18, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#DCE2EC' },
  askText: { fontSize: 15, lineHeight: 23, color: '#263955' },
  openButton: { borderRadius: 14, padding: 15, alignItems: 'center', borderWidth: 1.5, borderColor: '#2256CF' },
  openText: { color: '#2256CF', fontSize: 16, fontWeight: '700' },
  openDanger: { borderColor: '#B42318' },
  openDangerText: { color: '#B42318' },
});
