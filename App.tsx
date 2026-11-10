import { useEffect, useRef, useState } from 'react';
import { CameraView, scanFromURLAsync, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, AppState, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

type Result = { raw: string; url: string | null };
function readResult(raw: string): Result {
  const candidate = raw.trim();
  try {
    const url = new URL(candidate);
    if (/^https?:\/\//i.test(candidate) && !/\s/.test(candidate) && url.hostname &&
      (url.protocol === 'http:' || url.protocol === 'https:')) return { raw, url: url.href };
  } catch { /* Plain text QR payload. */ }
  return { raw, url: null };
}

export default function App() {
  const [permission, requestPermission, refreshPermission] = useCameraPermissions();
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('카메라로 스캔하거나 QR 이미지 한 장을 선택해 주세요.');
  const [result, setResult] = useState<Result | null>(null);
  const operation = useRef(false);
  const scanAccepted = useRef(true);
  const API_URL = process.env.EXPO_PUBLIC_API_URL;

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        scanAccepted.current = true;
        setScanning(false);
      } else void refreshPermission().catch(() => { });
    });
    return () => subscription.remove();
  }, [refreshPermission]);
  useEffect(() => {
    if (!scanning) return;
    const timeout = setTimeout(() => setMessage('아직 QR을 찾지 못했어요. 밝은 곳에서 QR 전체가 크게 보이도록 맞춰 주세요.'), 12000);
    return () => clearTimeout(timeout);
  }, [scanning]);

  async function sendToBackend(qrText: string) {
    try {
      const response = await fetch(`${API_URL}/api/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          qr_text: qrText,
          brand_texts: [],
        }),
      });

      const data = await response.json();
      setMessage(`서버 응답: ${JSON.stringify(data)}`);
    } catch {
      setMessage('서버 연결에 실패했어요.');
    }
  }

  async function startCamera() {
    if (operation.current) return;
    operation.current = true;
    setBusy(true);
    setResult(null);
    try {
      setMessage('카메라 권한을 확인하고 있어요. 요청 창이 뜨면 허용해 주세요.');
      const current = await refreshPermission();
      const next = current.granted || !current.canAskAgain ? current : await requestPermission();
      if (!next.granted) {
        setMessage(next.canAskAgain
          ? '카메라 권한이 거부되었어요. 스캔 버튼을 눌러 다시 허용하거나 사진을 선택해 주세요.'
          : '카메라 권한이 거부되었어요. 기기 설정에서 이 앱의 카메라 권한을 허용한 뒤 다시 시도해 주세요. 사진 선택도 가능해요.');
        return;
      }
      scanAccepted.current = false;
      setMessage('QR 전체를 카메라 안에 맞춰 주세요. 첫 번째로 인식한 QR만 표시해요.');
      setScanning(true);
    } catch {
      setMessage('카메라를 시작하지 못했어요. 권한과 카메라 사용 상태를 확인하고 다시 시도해 주세요.');
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
        mediaTypes: ['images'], allowsMultipleSelection: false, allowsEditing: false, quality: 1,
      });
      if (picked.canceled) {
        setMessage('이미지 선택을 취소했어요. 다시 선택하거나 카메라로 스캔해 주세요.');
        return;
      }
      const uri = picked.assets[0]?.uri;
      // Only local image URIs may enter the scanner. Never pass the QR payload here.
      if (!uri || !/^(file|content):\/\//i.test(uri)) {
        setMessage('기기에 저장된 이미지를 읽지 못했어요. 다른 사진으로 다시 시도해 주세요.');
        return;
      }
      setMessage('선택한 이미지에서 QR을 읽고 있어요.');
      const codes = await scanFromURLAsync(uri, ['qr']);
      const first = codes[0];
      if (!first) {
        setMessage('이미지에서 QR을 찾지 못했어요. QR 전체가 선명하고 크게 나온 사진을 선택해 주세요.');
        return;
      }
      const parsed = readResult(first.data);
      setResult(parsed);
      void sendToBackend(parsed.raw);
      setMessage('QR을 읽었어요. 아래 내용을 확인해 주세요.');
    } catch {
      setMessage('사진 선택 또는 QR 인식 중 문제가 발생했어요. 사진 접근 권한을 확인하고 다른 이미지로 다시 시도해 주세요.');
    } finally {
      operation.current = false;
      setBusy(false);
    }
  }

  const mobile = Platform.OS === 'android' || Platform.OS === 'ios';
  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.eyebrow}>QR ALERT</Text>
        <Text style={styles.title}>QR 입력</Text>
        <Text style={styles.description}>QR 내용을 기기에서 읽고 확인하세요. 이미지와 인식 결과를 서버로 보내지 않아요.</Text>
        <Pressable accessibilityRole="button" disabled={busy || !mobile || scanning} style={[styles.button, (busy || !mobile || scanning) && styles.disabled]} onPress={startCamera}>
          <Text style={styles.buttonText}>{result ? '다시 스캔하기' : '카메라로 QR 스캔'}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" disabled={busy || !mobile} style={[styles.button, styles.secondary, (busy || !mobile) && styles.disabled]} onPress={pickImage}>
          <Text style={styles.secondaryText}>사진 보관함에서 QR 이미지 선택</Text>
        </Pressable>
        {busy && <ActivityIndicator accessibilityLabel="처리 중" color="#2256CF" />}
        <Text accessibilityLiveRegion="polite" style={styles.message}>{mobile ? message : 'QR 입력은 Android 또는 iOS 기기의 Expo Go에서 사용해 주세요.'}</Text>
        {scanning && permission?.granted && <View style={styles.card}>
          <CameraView style={styles.camera} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onMountError={() => {
              scanAccepted.current = true;
              setScanning(false);
              setMessage('카메라를 열지 못했어요. 다른 앱의 카메라 사용을 종료한 뒤 다시 시도해 주세요.');
            }}
            onBarcodeScanned={({ data }) => {
              if (scanAccepted.current) return;
              scanAccepted.current = true;
              setScanning(false);
              const parsed = readResult(data);
              setResult(parsed);
              void sendToBackend(parsed.raw);
              setMessage('QR을 읽었어요. 아래 내용을 확인해 주세요.');
            }} />
          <Pressable accessibilityRole="button" style={styles.button} onPress={() => {
            scanAccepted.current = true;
            setScanning(false);
            setMessage('카메라 스캔을 중지했어요. 다시 스캔하거나 사진을 선택해 주세요.');
          }}><Text style={styles.buttonText}>스캔 중지</Text></Pressable>
        </View>}
        {result && <View style={styles.card}>
          <Text style={styles.heading}>QR 원본 문자열</Text>
          <Text selectable style={styles.value}>{result.raw === '' ? '(빈 문자열)' : result.raw}</Text>
          <Text style={styles.heading}>추출한 URL (HTTP/HTTPS)</Text>
          <Text selectable style={styles.value}>{result.url ?? '유효한 웹 URL이 아니에요.'}</Text>
          <Text style={styles.note}>URL은 텍스트로만 표시하며 사이트를 열거나 접속하지 않아요.</Text>
        </View>}
        <View style={styles.card}>
          <Text style={styles.heading}>상표명 OCR · 현재 미지원</Text>
          <Text style={styles.note}>현재 Expo Go 구성에서는 사진의 상표명을 읽는 OCR을 제공하지 않아요. 기기 내 OCR에는 별도 네이티브 모듈과 개발 빌드 검토가 필요해요. 사진은 전송하지 않으며 OCR 결과는 생성하지 않아요.</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F3F6FC' },
  content: { paddingHorizontal: 24, paddingTop: 64, paddingBottom: 48, gap: 16, width: '100%', maxWidth: 620, alignSelf: 'center' },
  eyebrow: { fontSize: 13, fontWeight: '700', color: '#2256CF', letterSpacing: 2 },
  title: { fontSize: 32, fontWeight: '800', color: '#152443' },
  description: { fontSize: 16, lineHeight: 25, color: '#465570' },
  button: { backgroundColor: '#2256CF', borderRadius: 14, padding: 17, alignItems: 'center', minHeight: 52 },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700', textAlign: 'center' },
  secondary: { backgroundColor: '#E1E9FB' },
  secondaryText: { color: '#173E99', fontSize: 16, fontWeight: '700', textAlign: 'center' },
  disabled: { opacity: 0.45 },
  message: { color: '#314566', fontSize: 15, lineHeight: 24 },
  card: { padding: 18, gap: 12, borderRadius: 18, backgroundColor: '#FFFFFF' },
  camera: { width: '100%', height: 300, borderRadius: 12, overflow: 'hidden' },
  heading: { fontSize: 16, fontWeight: '700', color: '#152443' },
  value: { fontSize: 15, lineHeight: 24, color: '#263955' },
  note: { fontSize: 14, lineHeight: 23, color: '#52617B' },
});
