import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { readBrandsFromPhoto, type BrandCandidate } from '../api/ocr';
import { photoForOcr } from '../api/photo';
import { searchStores, type Store } from '../api/stores';

// Optional context sent with the QR URL:
// - brand name: typed, or picked from candidates the server reads from a photo (OCR)
// - store: compared against the store's registered QR address
type Props = {
  brand: string;
  onBrandChange: (value: string) => void;
  onPrintedDomainsChange: (value: string[]) => void;
  store: Store | null;
  onStoreChange: (store: Store | null) => void;
  onBusyChange: (busy: boolean) => void;
  disabled?: boolean;
};

export function ExtraInfo({
  brand, onBrandChange, onPrintedDomainsChange, store, onStoreChange, onBusyChange, disabled,
}: Props) {
  const [open, setOpen] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [results, setResults] = useState<Store[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [candidates, setCandidates] = useState<BrandCandidate[]>([]);
  const [ocrMessage, setOcrMessage] = useState<string | null>(null);

  // Photo → server BAZE vision OCR → brand-name candidates the person picks from. Nothing is filled in automatically.
  async function readFromPhoto(source: 'camera' | 'library') {
    setReading(true);
    onBusyChange(true);
    setOcrMessage(null);
    setCandidates([]);
    try {
      if (source === 'camera') {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          setOcrMessage('카메라 권한이 없어요. 앨범에서 찾거나 상표명을 직접 입력해 주세요.');
          return;
        }
      }
      // Cropping limits the upload to the brand area; photoForOcr then downscales it.
      const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: true, quality: 0.9 };
      const picked = source === 'camera'
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);
      if (picked.canceled) return;
      onPrintedDomainsChange([]);
      const uri = picked.assets[0]?.uri;
      const photoUri = uri ? await photoForOcr(uri) : null;
      if (!photoUri) {
        setOcrMessage('사진을 읽지 못했어요. 다른 사진으로 다시 시도해 주세요.');
        return;
      }
      const result = await readBrandsFromPhoto(photoUri);
      setCandidates(result.candidates);
      onPrintedDomainsChange(result.printedDomains);
      setOcrMessage(result.message);
    } catch {
      setOcrMessage('사진을 가져오지 못했어요. 상표명을 직접 입력해 주세요.');
    } finally {
      setReading(false);
      onBusyChange(false);
    }
  }

  async function search() {
    const query = keyword.trim();
    if (!query) return;
    setSearching(true);
    setError(null);
    try {
      setResults(await searchStores(query));
    } catch {
      setResults(null);
      setError('매장을 검색하지 못했어요. 서버 연결을 확인해 주세요.');
    } finally {
      setSearching(false);
    }
  }

  const filled = [
    brand.trim() && `상표: ${brand.trim()}`,
    store && `매장: ${store.store_name}`,
  ].filter(Boolean).join(' · ');
  return (
    <View style={styles.card}>
      <Pressable accessibilityRole="button" style={styles.header} onPress={() => setOpen((v) => !v)}>
        <View style={styles.headerText}>
          <Text style={styles.heading}>추가 정보 (선택)</Text>
          <Text style={styles.note}>{filled || '상표명이나 매장을 알려주면 사칭 여부도 함께 확인해요.'}</Text>
        </View>
        <Text style={styles.toggle}>{open ? '접기' : '입력'}</Text>
      </Pressable>

      {open && <>
        <Text style={styles.label}>QR 근처에 보이는 상표명</Text>
        <TextInput
          value={brand}
          onChangeText={onBrandChange}
          editable={!disabled}
          placeholder="예: 스타벅스"
          maxLength={50}
          style={styles.input}
          accessibilityLabel="상표명"
        />
        <Text style={styles.hint}>입력한 상표의 공식 도메인과 QR 주소를 비교해요.</Text>

        <View style={styles.searchRow}>
          <Pressable accessibilityRole="button" disabled={disabled || reading} style={[styles.photoButton, (disabled || reading) && styles.disabled]} onPress={() => readFromPhoto('camera')}>
            <Text style={styles.searchButtonText}>사진 찍어서 찾기</Text>
          </Pressable>
          <Pressable accessibilityRole="button" disabled={disabled || reading} style={[styles.photoButton, (disabled || reading) && styles.disabled]} onPress={() => readFromPhoto('library')}>
            <Text style={styles.searchButtonText}>앨범에서 찾기</Text>
          </Pressable>
        </View>
        <Text style={styles.hint}>상표가 보이는 부분만 잘라 주세요. 사진은 백엔드를 거쳐 외부 BAZE AI 서버로 보내요. 백엔드는 영구 저장하지 않아요.</Text>
        {reading && <ActivityIndicator accessibilityLabel="사진에서 상표명 읽는 중" color="#2256CF" />}
        {ocrMessage && <Text style={styles.hint}>{ocrMessage}</Text>}
        {candidates.length > 0 && <>
          <Text style={styles.hint}>찾은 상표명 후보예요. 맞는 이름을 눌러 주세요.</Text>
          <View style={styles.chips}>
            {candidates.map((c) => (
              <Pressable key={c.brand} accessibilityRole="button" disabled={disabled}
                style={[styles.chip, brand.trim() === c.brand && styles.chipSelected]}
                onPress={() => { onBrandChange(c.brand); setCandidates([]); setOcrMessage(null); }}>
                <Text style={styles.chipText}>{c.brand}</Text>
                <Text style={styles.chipNote}>선택하면 AI가 공식 주소를 검색해요</Text>
              </Pressable>
            ))}
          </View>
        </>}
        <Text style={styles.label}>매장</Text>
        {store
          ? <View style={styles.selected}>
            <Text style={styles.selectedText}>{store.store_name}</Text>
            <Pressable accessibilityRole="button" disabled={disabled} onPress={() => onStoreChange(null)}>
              <Text style={styles.toggle}>선택 해제</Text>
            </Pressable>
          </View>
          : <>
            <View style={styles.searchRow}>
              <TextInput
                value={keyword}
                onChangeText={setKeyword}
                onSubmitEditing={search}
                editable={!disabled}
                placeholder="매장 이름 검색"
                maxLength={50}
                returnKeyType="search"
                style={[styles.input, styles.searchInput]}
                accessibilityLabel="매장 이름"
              />
              <Pressable accessibilityRole="button" disabled={disabled || searching} style={styles.searchButton} onPress={search}>
                <Text style={styles.searchButtonText}>검색</Text>
              </Pressable>
            </View>
            {searching && <ActivityIndicator color="#2256CF" />}
            {error && <Text style={styles.error}>{error}</Text>}
            {results?.length === 0 && <Text style={styles.hint}>등록된 매장이 없어요.</Text>}
            {results?.map((item) => (
              <Pressable key={item.store_id} accessibilityRole="button" style={styles.result} onPress={() => { onStoreChange(item); setResults(null); }}>
                <Text style={styles.selectedText}>{item.store_name}</Text>
                {item.verification_status !== 'verified' && <Text style={styles.hint}>검증되지 않은 매장 정보</Text>}
              </Pressable>
            ))}
          </>}
      </>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 18, gap: 10, borderRadius: 18, backgroundColor: '#FFFFFF' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerText: { flex: 1, gap: 2 },
  heading: { fontSize: 16, fontWeight: '700', color: '#152443' },
  note: { fontSize: 14, lineHeight: 21, color: '#52617B' },
  toggle: { fontSize: 14, fontWeight: '700', color: '#2256CF' },
  label: { fontSize: 14, fontWeight: '700', color: '#152443', marginTop: 6 },
  input: { borderWidth: 1, borderColor: '#C9D1DE', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: '#152443', backgroundColor: '#F8FAFD' },
  hint: { fontSize: 12, lineHeight: 18, color: '#6B778C' },
  searchRow: { flexDirection: 'row', gap: 8 },
  searchInput: { flex: 1 },
  searchButton: { backgroundColor: '#E1E9FB', borderRadius: 12, paddingHorizontal: 18, justifyContent: 'center' },
  searchButtonText: { color: '#173E99', fontSize: 15, fontWeight: '700' },
  selected: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, borderRadius: 12, backgroundColor: '#EEF3FD' },
  selectedText: { fontSize: 15, fontWeight: '600', color: '#152443' },
  result: { padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#DCE2EC', gap: 2 },
  error: { fontSize: 13, color: '#B42318' },
  photoButton: { flex: 1, backgroundColor: '#E1E9FB', borderRadius: 12, padding: 12, alignItems: 'center' },
  disabled: { opacity: 0.45 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: '#C9D1DE', backgroundColor: '#FFFFFF' },
  chipSelected: { borderColor: '#2256CF', backgroundColor: '#EEF3FD' },
  chipText: { fontSize: 15, fontWeight: '600', color: '#152443' },
  chipNote: { fontSize: 11, color: '#6B778C' },
});
