import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { StatusBar } from 'expo-status-bar';
import {
  ActivityIndicator,
  AppState,
  BackHandler,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';

import {
  analyzeQr,
  type AnalyzeOutcome,
  type PhotoNote,
} from './src/api/analyze';
import { readBrandsFromPhoto, type BrandOCRResult } from './src/api/ocr';
import { photoForOcr } from './src/api/photo';
import { QRPhotoError } from './src/api/qr-decode';
import { readQRFromPhoto } from './src/api/qr-photo';
import type { Store } from './src/api/stores';
import { ExtraInfo } from './src/input/ExtraInfo';
import { MOCK_RESULTS } from './src/mocks';
import { ResultScreen } from './src/result/ResultScreen';

// Sample result list for building the result screen. Off unless explicitly enabled in .env,
// so it never appears in demos (Expo Go always runs in __DEV__).
const SHOW_MOCKS = __DEV__ && process.env.EXPO_PUBLIC_SHOW_MOCKS === 'true';

type Result = { raw: string; url: string | null };
function readResult(raw: string): Result {
  const candidate = raw.trim();
  try {
    const url = new URL(candidate);
    if (
      /^https?:\/\//i.test(candidate) &&
      !/\s/.test(candidate) &&
      url.hostname &&
      (url.protocol === 'http:' || url.protocol === 'https:')
    )
      return { raw, url: url.href };
  } catch {
    /* Plain text QR payload. */
  }
  return { raw, url: null };
}

export default function App() {
  const [permission, requestPermission, refreshPermission] =
    useCameraPermissions();
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(
    '카메라로 스캔하거나 QR 이미지 한 장을 선택해 주세요.',
  );
  const [result, setResult] = useState<Result | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [outcome, setOutcome] = useState<AnalyzeOutcome | null>(null);
  const [brand, setBrand] = useState('');
  const [extraPrintedDomains, setExtraPrintedDomains] = useState<string[]>([]);
  const [store, setStore] = useState<Store | null>(null);
  const [extraBusy, setExtraBusy] = useState(false);
  const [pendingOCR, setPendingOCR] = useState<{
    parsed: Result;
    ocr: BrandOCRResult;
  } | null>(null);
  // Off by default (not saved): when on, a QR picked from the album is also sent to read brand names.
  const [photoAssist, setPhotoAssist] = useState(false);
  const operation = useRef(false);
  const submitting = useRef(false);
  const scanAccepted = useRef(true);
  // RN 0.88's ScrollView is a function component; take the instance type from its ref prop.
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        scanAccepted.current = true;
        setScanning(false);
      } else void refreshPermission().catch(() => {});
    });
    return () => subscription.remove();
  }, [refreshPermission]);
  useEffect(() => {
    if (!scanning) return;
    const timeout = setTimeout(
      () =>
        setMessage(
          '아직 QR을 찾지 못했어요. 밝은 곳에서 QR 전체가 크게 보이도록 맞춰 주세요.',
        ),
      12000,
    );
    return () => clearTimeout(timeout);
  }, [scanning]);
  // Android back: result → input screen, live scan → stop, while analyzing → ignore. Only the input screen exits.
  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        if (outcome) {
          backToInput();
          return true;
        }
        if (scanning) {
          scanAccepted.current = true;
          setScanning(false);
          setMessage(
            '카메라 스캔을 중지했어요. 다시 스캔하거나 사진을 선택해 주세요.',
          );
          return true;
        }
        if (pendingOCR) {
          setPendingOCR(null);
          setResult(null);
          return true;
        }
        return analyzing || extraBusy;
      },
    );
    return () => subscription.remove();
  }, [outcome, scanning, analyzing, extraBusy, pendingOCR]);

  // Reading a QR photo pauses here: no URL analysis runs before the person confirms or skips OCR.
  async function analyze(parsed: Result, photoUri?: string) {
    if (photoUri && parsed.url) {
      setAnalyzing(true);
      setMessage('사진에서 상표명을 읽고 있어요.');
      try {
        const prepared = await photoForOcr(photoUri);
        const ocr = prepared
          ? await readBrandsFromPhoto(prepared)
          : {
              status: 'invalid_image' as const,
              candidates: [],
              printedDomains: [],
              message:
                '사진을 읽지 못했어요. 다시 선택하거나 상표명을 직접 입력해 주세요.',
            };
        setPendingOCR({ parsed, ocr });
        setMessage('상표 후보를 확인하거나 상표 비교를 건너뛰어 주세요.');
      } finally {
        setAnalyzing(false);
      }
      return;
    }
    await submitAnalysis(parsed, brand.trim(), undefined, extraPrintedDomains);
  }

  async function submitAnalysis(
    parsed: Result,
    confirmedBrand: string,
    photo?: PhotoNote,
    printedDomains: string[] = [],
  ) {
    if (submitting.current) return;
    submitting.current = true;
    setPendingOCR(null);
    setAnalyzing(true);
    setMessage('QR 주소를 검사하고 있어요. 사이트는 자동으로 열지 않아요.');
    try {
      const next = await analyzeQr(parsed.raw, parsed.url, {
        brandTexts: confirmedBrand ? [confirmedBrand] : [],
        printedDomains,
        storeId: store?.store_id ?? null,
      });
      setOutcome(next.kind === 'analysis' ? { ...next, photo } : next);
    } finally {
      setAnalyzing(false);
      submitting.current = false;
      setBrand('');
      setExtraPrintedDomains([]);
      setStore(null);
    }
  }

  function confirmOCR(confirmedBrand: string) {
    if (!pendingOCR) return;
    const { parsed, ocr } = pendingOCR;
    const photo: PhotoNote = ocr.candidates.length
      ? {
          kind: 'found',
          brands: ocr.candidates.map((c) => c.brand),
          usedBrand: confirmedBrand || null,
        }
      : { kind: 'skipped', reason: ocr.message };
    void submitAnalysis(parsed, confirmedBrand, photo, ocr.printedDomains);
  }

  function backToInput() {
    setPendingOCR(null);
    setOutcome(null);
    setResult(null);
    setMessage('카메라로 스캔하거나 QR 이미지 한 장을 선택해 주세요.');
  }

  // Keep the complete poster for OCR; the QR decoder uses separate local crops on failure.
  async function capturePhoto() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setMessage(
        '카메라 권한이 없어요. 기기 설정에서 허용하거나 사진을 선택해 주세요.',
      );
      return;
    }
    setMessage('QR과 주변 상표·안내문이 선명하게 같이 나오도록 찍어 주세요.');
    const shot = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 1,
    });
    if (shot.canceled) {
      setMessage('촬영을 취소했어요. 다시 찍거나 사진을 선택해 주세요.');
      return;
    }
    const asset = shot.assets[0];
    if (!asset?.uri || !/^(file|content):\/\//i.test(asset.uri)) {
      setMessage('찍은 사진을 읽지 못했어요. 다시 찍어 주세요.');
      return;
    }
    setMessage('찍은 사진에서 QR을 읽고 있어요.');
    const first = await readQRFromPhoto(asset.uri, true, () =>
      setMessage('서버에서 사진 속 QR을 읽고 있어요. 주소는 열지 않아요.'),
    );
    if (!first) {
      setMessage(
        '휴대폰과 서버 모두 QR을 읽지 못했어요. 원본 QR 이미지를 선택하거나 더 선명한 사진으로 확인해 주세요.',
      );
      return;
    }
    const parsed = readResult(first.data);
    setResult(parsed);
    void analyze(parsed, asset.uri);
  }

  async function startCamera() {
    if (operation.current) return;
    operation.current = true;
    setBusy(true);
    setResult(null);
    try {
      setMessage(
        '카메라 권한을 확인하고 있어요. 요청 창이 뜨면 허용해 주세요.',
      );
      const current = await refreshPermission();
      const next =
        current.granted || !current.canAskAgain
          ? current
          : await requestPermission();
      if (!next.granted) {
        setMessage(
          next.canAskAgain
            ? '카메라 권한이 거부되었어요. 스캔 버튼을 눌러 다시 허용하거나 사진을 선택해 주세요.'
            : '카메라 권한이 거부되었어요. 기기 설정에서 이 앱의 카메라 권한을 허용한 뒤 다시 시도해 주세요. 사진 선택도 가능해요.',
        );
        return;
      }
      if (photoAssist) {
        await capturePhoto();
        return;
      }
      scanAccepted.current = false;
      setMessage(
        'QR 전체를 카메라 안에 맞춰 주세요. 첫 번째로 인식한 QR만 표시해요.',
      );
      setScanning(true);
    } catch (error) {
      setMessage(
        error instanceof QRPhotoError
          ? error.message
          : error instanceof Error && error.message === 'PHOTO_QR_UNREADABLE'
            ? '사진 파일을 QR 인식기가 처리하지 못했어요. JPG/PNG 사진을 선택하거나 실시간 스캔을 이용해 주세요.'
            : '카메라를 시작하지 못했어요. 권한과 카메라 사용 상태를 확인하고 다시 시도해 주세요.',
      );
    } finally {
      operation.current = false;
      setBusy(false);
    }
  }

  async function pickImage() {
    if (operation.current) return;
    operation.current = true;
    scanAccepted.current = true;
    setScanning(false);
    setBusy(true);
    setResult(null);
    setMessage('QR 이미지 한 장을 선택해 주세요.');
    try {
      // System picker grants access to the selected image without broad library permission.
      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: false,
        allowsEditing: false,
        quality: 1,
      });
      if (picked.canceled) {
        setMessage(
          '이미지 선택을 취소했어요. 다시 선택하거나 카메라로 스캔해 주세요.',
        );
        return;
      }
      const uri = picked.assets[0]?.uri;
      // Only local image URIs may enter the scanner. Never pass the QR payload here.
      if (!uri || !/^(file|content):\/\//i.test(uri)) {
        setMessage(
          '기기에 저장된 이미지를 읽지 못했어요. 다른 사진으로 다시 시도해 주세요.',
        );
        return;
      }
      setMessage('선택한 이미지에서 QR을 읽고 있어요.');
      const first = await readQRFromPhoto(uri, photoAssist, () =>
        setMessage('서버에서 사진 속 QR을 읽고 있어요. 주소는 열지 않아요.'),
      );
      if (!first) {
        setMessage(
          photoAssist
            ? '휴대폰과 서버 모두 QR을 읽지 못했어요. 원본 QR 이미지나 더 선명한 사진으로 확인해 주세요.'
            : '휴대폰에서 QR을 읽지 못했어요. 사진 인식을 켜면 검사 서버에서도 QR 사진을 확인할 수 있어요.',
        );
        return;
      }
      const parsed = readResult(first.data);
      setResult(parsed);
      // The photo leaves the phone only when photoAssist is on.
      void analyze(parsed, photoAssist ? uri : undefined);
    } catch (error) {
      setMessage(
        error instanceof QRPhotoError
          ? error.message
          : error instanceof Error && error.message === 'PHOTO_QR_UNREADABLE'
            ? '사진 파일을 QR 인식기가 처리하지 못했어요. JPG/PNG 사진을 선택하거나 실시간 스캔을 이용해 주세요.'
            : '사진 선택 또는 QR 인식 중 문제가 발생했어요. 사진 접근 권한을 확인하고 다른 이미지로 다시 시도해 주세요.',
      );
    } finally {
      operation.current = false;
      setBusy(false);
    }
  }

  const mobile = Platform.OS === 'android' || Platform.OS === 'ios';
  if (outcome) {
    return (
      <View style={styles.screen}>
        <StatusBar style="dark" />
        <ResultScreen outcome={outcome} onRescan={backToInput} />
      </View>
    );
  }
  const locked = busy || analyzing || extraBusy || pendingOCR !== null;
  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />
      <ScrollView ref={scrollRef} contentContainerStyle={styles.content}>
        <Text style={styles.eyebrow}>QURE</Text>
        <Text style={styles.title}>QR 입력</Text>
        <Text style={styles.description}>
          {photoAssist
            ? 'QR 주소와 QR 사진을 검사 서버로 보내 위험한지 확인해요. 사이트는 자동으로 열지 않아요.'
            : '기본 스캔은 QR 주소를 검사 서버로 보내요. 사진 인식을 선택하면 사진도 외부 AI 서버로 전송돼요. 사이트는 자동으로 열지 않아요.'}
        </Text>
        <Pressable
          accessibilityRole="button"
          disabled={locked || !mobile || scanning}
          style={[
            styles.button,
            (locked || !mobile || scanning) && styles.disabled,
          ]}
          onPress={startCamera}
        >
          <Text style={styles.buttonText}>
            {photoAssist
              ? '카메라로 QR 사진 찍기'
              : result
                ? '다시 스캔하기'
                : '카메라로 QR 스캔'}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={locked || !mobile}
          style={[
            styles.button,
            styles.secondary,
            (locked || !mobile) && styles.disabled,
          ]}
          onPress={pickImage}
        >
          <Text style={styles.secondaryText}>
            사진 보관함에서 QR 이미지 선택
          </Text>
        </Pressable>
        {/* Live camera sits right under the input buttons so it is on screen without scrolling. */}
        {scanning && permission?.granted && (
          <View
            style={styles.card}
            // Scroll so the camera card is at the top of the screen as soon as it is laid out.
            onLayout={(e) =>
              scrollRef.current?.scrollTo({
                y: Math.max(0, e.nativeEvent.layout.y - 16),
                animated: true,
              })
            }
          >
            <Text accessibilityLiveRegion="polite" style={styles.message}>
              {message}
            </Text>
            <CameraView
              style={styles.camera}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onMountError={() => {
                scanAccepted.current = true;
                setScanning(false);
                setMessage(
                  '카메라를 열지 못했어요. 다른 앱의 카메라 사용을 종료한 뒤 다시 시도해 주세요.',
                );
              }}
              onBarcodeScanned={({ data }) => {
                if (scanAccepted.current) return;
                scanAccepted.current = true;
                setScanning(false);
                const parsed = readResult(data);
                setResult(parsed);
                void analyze(parsed);
              }}
            />
            <Pressable
              accessibilityRole="button"
              style={styles.button}
              onPress={() => {
                scanAccepted.current = true;
                setScanning(false);
                setMessage(
                  '카메라 스캔을 중지했어요. 다시 스캔하거나 사진을 선택해 주세요.',
                );
              }}
            >
              <Text style={styles.buttonText}>스캔 중지</Text>
            </Pressable>
          </View>
        )}
        {/* While the live camera is open, show only the camera; the rest comes back when scanning stops. */}
        {!scanning && (
          <>
            <View
              style={[styles.switchCard, photoAssist && styles.switchCardOn]}
            >
              <View style={styles.switchText}>
                <Text style={styles.heading}>QR 사진으로 상표명도 찾기</Text>
                <Text style={styles.note}>
                  {photoAssist
                    ? '켜짐: 카메라 버튼은 사진 촬영으로 바뀌어요. QR과 주변 상표·안내문을 함께 찍어 주세요. 사진을 검사 서버로 보내 QR을 읽고, 인식한 주소로 상표 비교를 진행해요. 사진이 백엔드를 거쳐 외부 BAZE AI 서버로 전송돼요. 백엔드는 영구 저장하지 않아요. 인식한 상표는 확인 후 사용해요.'
                    : '켜면 QR 사진에서 상표명 후보를 찾아요. 사용자가 선택한 상표의 공식 도메인과 QR 주소를 비교해요.'}
                </Text>
              </View>
              <Switch
                value={photoAssist}
                onValueChange={setPhotoAssist}
                disabled={locked || scanning}
                accessibilityLabel="QR 사진으로 상표명도 찾기"
              />
            </View>
            <ExtraInfo
              onPrintedDomainsChange={setExtraPrintedDomains}
              brand={brand}
              onBrandChange={setBrand}
              store={store}
              onStoreChange={setStore}
              onBusyChange={setExtraBusy}
              disabled={locked}
            />
            {pendingOCR && (
              <View
                style={styles.card}
                onLayout={(e) =>
                  scrollRef.current?.scrollTo({
                    y: Math.max(0, e.nativeEvent.layout.y - 16),
                    animated: true,
                  })
                }
              >
                <Text style={styles.heading}>사진 속 상표 확인</Text>
                <Text style={styles.note}>{pendingOCR.ocr.message}</Text>
                <Text style={styles.note}>
                  AI가 읽은 이름을 사진과 비교해 주세요. 공식 도메인 등록은
                  사이트 안전 판정이 아니에요.
                </Text>
                {pendingOCR.ocr.candidates.map((candidate) => (
                  <Pressable
                    key={candidate.brand}
                    accessibilityRole="button"
                    style={styles.button}
                    onPress={() => confirmOCR(candidate.brand)}
                  >
                    <Text style={styles.buttonText}>
                      {candidate.brand} 확인하고 검사 (
                      {candidate.registered
                        ? '공식 도메인 등록'
                        : '공식 도메인 미등록'}
                      )
                    </Text>
                  </Pressable>
                ))}
                <Pressable
                  accessibilityRole="button"
                  style={[styles.button, styles.secondary]}
                  onPress={() => confirmOCR(brand.trim())}
                >
                  <Text style={styles.secondaryText}>
                    {brand.trim()
                      ? `직접 입력한 '${brand.trim()}'로 검사`
                      : '상표 비교 없이 URL만 검사'}
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  style={styles.secondary}
                  onPress={() => {
                    setPendingOCR(null);
                    setResult(null);
                    setMessage('촬영 또는 사진 선택을 다시 진행해 주세요.');
                  }}
                >
                  <Text style={styles.secondaryText}>취소하고 다시 선택</Text>
                </Pressable>
              </View>
            )}
            {(busy || analyzing || extraBusy) && (
              <ActivityIndicator
                accessibilityLabel={analyzing ? '주소 검사 중' : '처리 중'}
                color="#2256CF"
              />
            )}
            <Text accessibilityLiveRegion="polite" style={styles.message}>
              {mobile
                ? message
                : 'QR 입력은 Android 또는 iOS 기기의 Expo Go에서 사용해 주세요.'}
            </Text>
            {result && (
              <View style={styles.card}>
                <Text style={styles.heading}>QR 원본 문자열</Text>
                <Text selectable style={styles.value}>
                  {result.raw === '' ? '(빈 문자열)' : result.raw}
                </Text>
                <Text style={styles.heading}>추출한 URL (HTTP/HTTPS)</Text>
                <Text selectable style={styles.value}>
                  {result.url ?? '유효한 웹 URL이 아니에요.'}
                </Text>
                <Text style={styles.note}>
                  URL은 텍스트로만 표시하며 사이트를 열거나 접속하지 않아요.
                </Text>
              </View>
            )}
            {SHOW_MOCKS && (
              <View style={styles.card}>
                <Text style={styles.heading}>개발용 · 샘플 결과 화면 보기</Text>
                <Text style={styles.note}>
                  .env의 EXPO_PUBLIC_SHOW_MOCKS=true일 때만 보여요. 시연 전에
                  false로 바꾸세요.
                </Text>
                {MOCK_RESULTS.map((mock) => (
                  <Pressable
                    key={mock.label}
                    accessibilityRole="button"
                    style={styles.mockButton}
                    onPress={() => setOutcome(mock.outcome)}
                  >
                    <Text style={styles.secondaryText}>{mock.label}</Text>
                  </Pressable>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F3F6FC' },
  content: {
    paddingHorizontal: 24,
    paddingTop: 64,
    paddingBottom: 48,
    gap: 16,
    width: '100%',
    maxWidth: 620,
    alignSelf: 'center',
  },
  eyebrow: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2256CF',
    letterSpacing: 2,
  },
  title: { fontSize: 32, fontWeight: '800', color: '#152443' },
  description: { fontSize: 16, lineHeight: 25, color: '#465570' },
  button: {
    backgroundColor: '#2256CF',
    borderRadius: 14,
    padding: 17,
    alignItems: 'center',
    minHeight: 52,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  secondary: { backgroundColor: '#E1E9FB' },
  secondaryText: {
    color: '#173E99',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  disabled: { opacity: 0.45 },
  message: { color: '#314566', fontSize: 15, lineHeight: 24 },
  card: { padding: 18, gap: 12, borderRadius: 18, backgroundColor: '#FFFFFF' },
  camera: { width: '100%', height: 300, borderRadius: 12, overflow: 'hidden' },
  heading: { fontSize: 16, fontWeight: '700', color: '#152443' },
  value: { fontSize: 15, lineHeight: 24, color: '#263955' },
  note: { fontSize: 14, lineHeight: 23, color: '#52617B' },
  switchCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DCE2EC',
  },
  switchCardOn: { borderColor: '#2256CF', backgroundColor: '#EEF3FD' },
  switchText: { flex: 1, gap: 4 },
  mockButton: {
    backgroundColor: '#E1E9FB',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
  },
});
