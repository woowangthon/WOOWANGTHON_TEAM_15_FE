import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { searchStores, type Store } from '../api/stores';

// Optional context sent with the QR URL:
// - brand name: compared against the official-domain DB (to be filled by OCR once task 1 lands)
// - store: compared against the store's registered QR address
type Props = {
  brand: string;
  onBrandChange: (value: string) => void;
  store: Store | null;
  onStoreChange: (store: Store | null) => void;
  disabled?: boolean;
};

export function ExtraInfo({ brand, onBrandChange, store, onStoreChange, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [results, setResults] = useState<Store[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const filled = [brand.trim() && `상표: ${brand.trim()}`, store && `매장: ${store.store_name}`].filter(Boolean).join(' · ');
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
        <Text style={styles.hint}>입력한 상표의 공식 도메인과 QR 주소를 비교해요. 사진 속 상표명 자동 인식(OCR)은 아직 지원하지 않아요.</Text>

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
});
