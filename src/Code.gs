/**
 * SITINAJA — Sistem Tinjau Anomali NTB Aja (SE2026), web app Google Apps Script
 *
 * Dikembangkan oleh BPS Kabupaten Luwu (BPS-7317), 2026.
 * Satker lain boleh menggunakan dan menyesuaikan kode ini dengan tetap mencantumkan
 * atribusi "SITINAJA · BPS Kabupaten Luwu (7317)" pada tampilan dan dokumentasinya.
 *
 * Menu: Pemeriksaan (cek & perbaiki per usaha) dan Dashboard (progres per pemeriksa).
 *
 * Rumus (cocok dengan kolom metrik_* di sheet Database):
 *   Output = pendapatan barang/jasa − pembelian barang dagangan
 *   NTB    = Output − biaya produksi − biaya operasional
 *   Rasio  = NTB ÷ Output, wajar jika di dalam batas kategori
 * Usaha yang mulai beroperasi 2026: isian FASIH per bulan (pendapatan di rincian 31, pengeluaran di rincian 30),
 * nilai tahunan = isian × 12. Kolom metrik_* di Database menyimpan nilai tahunan.
 */

const CONFIG = {
  // Kosongkan jika skrip dibuat dari dalam spreadsheet (Ekstensi → Apps Script).
  SPREADSHEET_ID: '',

  APP_TITLE: 'SITINAJA',
  APP_SUBTITLE: 'Sistem Tinjau Anomali NTB Aja',
  // Identitas satker PENGGUNA (tampil di judul aplikasi dan nama file TUNTAS).
  // Atribusi pengembang di bagian bawah halaman tetap "BPS Kabupaten Luwu (BPS-7317)".
  PEMILIK: 'BPS Kabupaten Luwu',
  KODE_SATKER: '7317',

  // Nama sheet data. Kosongkan untuk memakai sheet pertama yang punya kolom assignment_id.
  SHEET_DATA: 'Database',

  // Sheet catatan FASIH (kolom assignment_id + catatan_kunjungan_1..3, catatan_pml, catatan_umum,
  // catatan_anomali_admin). Kosongkan untuk mencari otomatis sheet yang punya kolom catatan_umum.
  SHEET_CATATAN: '',

  // Sheet hasil koreksi dalam format Template TUNTAS (dibuat otomatis).
  SHEET_TUNTAS: 'Log Koreksi',

  // Tahun mulai operasi yang isiannya per bulan (dikali 12).
  TAHUN_BULANAN: ['2026'],

  // Remark. #0 = tidak ada perubahan (tidak masuk file TUNTAS); #1–#4 = kode_catatan TUNTAS.
  REMARK: [
    '#0: Sesuai Kondisi Lapangan/ Tidak ada perubahan',
    '#1: Perbaikan kesalahan petugas/entri kuesioner',
    '#2: Hasil konfirmasi/revisit responden',
    '#3: Survei rutin/data administrasi',
    '#4: Metode/informasi lain'
  ],

  // Variabel yang diberi remark #0 bila angka tidak diubah (pendapatan = 27a, atau 31a untuk tahun 2026).
  VARIABEL_REMARK_0: ['pendapatan'],

  // Nama variabel FASIH (dataKey) untuk kolom file TUNTAS.
  // Cek dengan tombol "Cari dataKey" di popup TUNTAS dan sesuaikan bila berbeda.
  DATAKEY: {
    upah: 'r26a',
    produksi: 'r26b',
    beli: 'r26c',
    operasional: 'r26d',
    nonop: 'r26e',
    pendapatan: 'r27a',
    lain: 'r27b'
  },

  // Usaha tahun 2026 (isian per bulan): pengeluaran di rincian 30, pendapatan di rincian 31.
  DATAKEY_BULANAN: {
    upah: 'r30a',
    produksi: 'r30b',
    beli: 'r30c',
    operasional: 'r30d',
    nonop: 'r30e',
    pendapatan: 'r31a',
    lain: 'r31b'
  },

  // Batas wajar rasio NTB/Output per kategori [MIN, MAX] (Rekap Anomali Tahap 1).
  BATAS_KATEGORI: {
    A: [0.51, 0.94], B: [0.28, 0.81], C: [0.15, 0.61], D: [0.13, 0.68], E: [0.29, 0.47],
    F: [0.34, 0.44], G: [0.64, 0.78], H: [0.29, 0.64], I: [0.36, 0.69], J: [0.36, 0.73],
    K: [0.50, 0.72], L: [0.46, 0.86], M: [0.50, 0.99], N: [0.44, 0.57], O: [0.54, 0.66],
    Q: [0.27, 0.82], R: [0.20, 0.60], S: [0.21, 0.57], T: [0.30, 0.69]
  },
  BATAS_UMUM: [0.10, 0.90],   // untuk kategori tanpa batas (P, U)

  // Dashboard
  BATAS_WAKTU: '2026-10-23',       // tanggal target selesai (YYYY-MM-DD), sesuaikan
  HITUNG_SABTU_MINGGU: false,      // false = hanya hari kerja Senin–Jumat
  JAM_KERJA_PER_HARI: 8
};

/** Judul kolom yang dikenali (tidak peka huruf besar/kecil; spasi = garis bawah). */
const KOLOM = {
  id:          ['assignment_id'],
  link:        ['link_fasih_sm', 'link_fasih', 'link'],
  nama:        ['nama_usaha'],
  kategori:    ['kategori'],
  kbli:        ['kode_kbli', 'kbli_akhir', 'kbli'],
  kec:         ['level_3_full_code', 'kode_kecamatan'],
  desa:        ['level_4_full_code', 'kode_desa'],
  tahun:       ['tahun_operasi', 'tahun_mulai_operasi'],
  tk:          ['metrik_tenaga_kerja'],
  catatan:     ['catatan'],
  pemeriksa:   ['pemeriksa'],
  selesai:     ['selesai'],

  upah:        ['metrik_upah_gaji'],
  produksi:    ['metrik_biaya_produksi'],
  beli:        ['metrik_biaya_pembelian'],
  operasional: ['metrik_biaya_operasional'],
  nonop:       ['metrik_biaya_non_operasional'],
  pendapatan:  ['metrik_pendapatan_barang_jasa'],
  lain:        ['metrik_pendapatan_lainnya'],

  totalBiaya:  ['metrik_total_pengeluaran'],
  ntb:         ['metrik_nilai_tambah'],
  output:      ['metrik_output'],
  rasio:       ['rasio_ntb'],

  remark:      ['remark'],
  oleh:        ['dicek_oleh'],
  waktu:       ['waktu_cek'],
  asli:        ['nilai_asli']
};

const ISIAN = ['upah', 'produksi', 'beli', 'operasional', 'nonop', 'pendapatan', 'lain'];

// Kolom yang dibuat otomatis di ujung kanan sheet jika belum ada
const KOLOM_BARU = { selesai: 'Selesai', remark: 'REMARK', oleh: 'DICEK_OLEH', waktu: 'WAKTU_CEK', asli: 'NILAI_ASLI' };

/* ================================================================ web app */

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle(CONFIG.APP_TITLE + ' · ' + CONFIG.APP_SUBTITLE + ' · ' + CONFIG.PEMILIK)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** Pengaturan + daftar pemeriksa. */
function getMeta() {
  const ss = ss_();
  const sh = sheetData_();
  const m = petaKolom_(header_(sh));
  const n = sh.getLastRow() - 1;
  const daftar = {};
  if (m.pemeriksa >= 0 && n > 0) {
    sh.getRange(2, m.pemeriksa + 1, n, 1).getValues().forEach(function (r) {
      const k = teksSel_(r[0]) || '(tanpa pemeriksa)';
      daftar[k] = (daftar[k] || 0) + 1;
    });
  }
  return {
    title: CONFIG.APP_TITLE,
    pemilik: CONFIG.PEMILIK + ' (' + CONFIG.KODE_SATKER + ')',
    url: ss.getUrl(),
    sheet: sh.getName(),
    gid: sh.getSheetId(),
    pemeriksa: Object.keys(daftar).sort().map(function (k) { return { name: k, count: daftar[k] }; }),
    remarks: CONFIG.REMARK,
    dataKey: CONFIG.DATAKEY,
    tahunBulanan: CONFIG.TAHUN_BULANAN
  };
}

/** Berkas milik satu pemeriksa ('' = semua). */
function getData(pemeriksa) {
  const sh = sheetData_();
  const values = sh.getDataRange().getValues();
  const m = petaKolom_(values[0]);
  pemeriksa = String(pemeriksa || '');
  const catatan = bacaCatatan_();
  const rows = [];
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    if (!teksSel_(row[m.id])) continue;
    if (pemeriksa && (m.pemeriksa < 0 || (teksSel_(row[m.pemeriksa]) || '(tanpa pemeriksa)') !== pemeriksa)) continue;
    const rec = rekam_(row, m, i + 1);
    rec.catatanFasih = catatan ? (catatan[rec.id] || []) : null;
    rows.push(rec);
  }
  return { rows: rows, adaCatatanFasih: !!catatan };
}

/**
 * Simpan hasil cek satu usaha.
 * payload: { row, id, nama, values: {upah,...} dalam satuan FASIH (per bulan untuk tahun 2026), remark, pemeriksa }
 */
function saveRecord(payload) {
  const sh = sheetData_();
  let m = petaKolom_(header_(sh));

  // Kolom tambahan dibuat sekali saja (perlu antre agar tidak dobel)
  if (Object.keys(KOLOM_BARU).some(function (k) { return m[k] < 0; })) {
    denganKunci_(function () { m = siapkanKolom_(sh, petaKolom_(header_(sh))); });
  }

  const lastCol = sh.getLastColumn();
  const r = cariBaris_(sh, m, payload);
  const range = sh.getRange(r, 1, 1, lastCol);
  const rowVals = range.getValues()[0];
  const rowRumus = range.getFormulas()[0];
  const sebelum = rekam_(rowVals, m, r);
  const faktor = sebelum.faktor;

  // nilai baru (tahunan)
  const v = {};
  ISIAN.forEach(function (k) {
    const x = payload.values ? payload.values[k] : undefined;
    v[k] = (m[k] >= 0 && x !== undefined && x !== null && x !== '') ? angka_(x) * faktor : sebelum.v[k];
  });
  const h = hitung_(v);
  const asli = sebelum.asli || sebelum.v;   // nilai FASIH sebelum koreksi pertama

  let remark = String(payload.remark || '').trim();
  const berubah = ISIAN.some(function (k) { return Number(asli[k]) !== Number(v[k]); });
  if (berubah && kodeRemark_(remark) === '#0') remark = CONFIG.REMARK[1];

  let pemeriksa = String(payload.pemeriksa || '').trim();
  if (!pemeriksa) { try { pemeriksa = Session.getActiveUser().getEmail(); } catch (e) { pemeriksa = ''; } }

  const tulis = {};
  ISIAN.forEach(function (k) { if (m[k] >= 0) tulis[m[k]] = v[k]; });
  if (m.totalBiaya >= 0) tulis[m.totalBiaya] = h.totalBiaya;
  if (m.ntb >= 0) tulis[m.ntb] = h.ntb;
  if (m.output >= 0) tulis[m.output] = h.output;
  if (m.rasio >= 0) tulis[m.rasio] = h.rasio === null ? '' : bulat_(h.rasio, 6);
  tulis[m.selesai] = true;
  tulis[m.remark] = remark;
  tulis[m.oleh] = pemeriksa;
  tulis[m.waktu] = new Date();
  if (!sebelum.asli) tulis[m.asli] = JSON.stringify(sebelum.v);

  // Tulis baris sekaligus (satu panggilan), kolom berumus tetap berisi rumusnya.
  // Baris milik satu usaha, jadi tidak perlu antre dengan pemeriksa lain.
  const kol = Object.keys(tulis).map(Number).filter(function (c) { return c >= 0 && !rowRumus[c]; });
  const awal = Math.min.apply(null, kol), akhir = Math.max.apply(null, kol);
  const baris = [];
  for (let c = awal; c <= akhir; c++) {
    if (rowRumus[c]) baris.push(rowRumus[c]);
    else if (Object.prototype.hasOwnProperty.call(tulis, c) && !(rowVals[c] === '' && tulis[c] === 0)) baris.push(tulis[c]);
    else baris.push(rowVals[c]);
  }
  sh.getRange(r, awal + 1, 1, baris.length).setValues([baris]);

  // Log Koreksi dipakai bersama → antre singkat
  denganKunci_(function () {
    tulisTuntas_(sebelum, asli, v, remark);
    SpreadsheetApp.flush();
  });

  const hasil = rowVals.slice();
  for (let c = awal; c <= akhir; c++) hasil[c] = rowRumus[c] ? rowVals[c] : baris[c - awal];
  return rekam_(hasil, m, r);
}

/** Jalankan fn dengan kunci skrip; menunggu hingga 30 detik. */
function denganKunci_(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error('Server sedang sibuk (banyak yang menyimpan bersamaan). Coba simpan lagi.');
  try { return fn(); } finally { lock.releaseLock(); }
}

/** Data dashboard: progres per pemeriksa + selesai per hari. */
function getDashboard() {
  const sh = sheetData_();
  const values = sh.getDataRange().getValues();
  const m = petaKolom_(values[0]);
  const tz = Session.getScriptTimeZone();
  const hariIni = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  const orang = {};
  const harian = {};
  const remark = {};
  let tanpaTanggal = 0;

  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    if (!teksSel_(row[m.id])) continue;
    const nama = (m.pemeriksa >= 0 ? teksSel_(row[m.pemeriksa]) : '') || '(tanpa pemeriksa)';
    const o = orang[nama] || (orang[nama] = { name: nama, target: 0, done: 0, today: 0 });
    o.target++;
    if (!selesai_(row, m)) continue;
    o.done++;
    const kode = m.remark >= 0 ? kodeRemark_(row[m.remark]) : '';
    remark[kode || '(tanpa remark)'] = (remark[kode || '(tanpa remark)'] || 0) + 1;
    const w = m.waktu >= 0 ? row[m.waktu] : '';
    if (w instanceof Date) {
      const tgl = Utilities.formatDate(w, tz, 'yyyy-MM-dd');
      harian[tgl] = (harian[tgl] || 0) + 1;
      if (tgl === hariIni) o.today++;
    } else {
      tanpaTanggal++;
    }
  }

  const tuntas = ss_().getSheetByName(CONFIG.SHEET_TUNTAS);
  return {
    hariIni: hariIni,
    batasWaktu: CONFIG.BATAS_WAKTU,
    hariKerjaSisa: hariKerjaSisa_(hariIni, CONFIG.BATAS_WAKTU),
    jamPerHari: CONFIG.JAM_KERJA_PER_HARI,
    orang: Object.keys(orang).sort().map(function (k) { return orang[k]; }),
    harian: Object.keys(harian).sort().map(function (k) { return { tgl: k, n: harian[k] }; }),
    tanpaTanggal: tanpaTanggal,
    remark: remark,
    barisTuntas: tuntas ? Math.max(0, tuntas.getLastRow() - 1) : 0
  };
}

/**
 * Isi sheet Log Koreksi untuk diunduh sebagai .xlsx langsung di browser (akun mana pun bisa).
 */
function getLogKoreksi() {
  const src = ss_().getSheetByName(CONFIG.SHEET_TUNTAS);
  if (!src || src.getLastRow() < 2) throw new Error('Log Koreksi masih kosong: belum ada usaha yang disimpan.');
  const tz = Session.getScriptTimeZone();
  return {
    nama: 'TUNTAS ' + CONFIG.APP_TITLE + ' BPS-' + CONFIG.KODE_SATKER + ' ' + Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH.mm'),
    data: src.getDataRange().getValues()
  };
}

/**
 * Cadangan untuk akun pemilik: buat file baru berisi isi sheet Log Koreksi dengan nama sheet "DATA",
 * siap diunduh sebagai .xlsx dan diunggah ke TUNTAS.
 */
function buatFileTuntas() {
  const src = ss_().getSheetByName(CONFIG.SHEET_TUNTAS);
  if (!src || src.getLastRow() < 2) throw new Error('Log Koreksi masih kosong: belum ada usaha yang disimpan.');
  const data = src.getDataRange().getValues();
  const tz = Session.getScriptTimeZone();
  const nama = 'TUNTAS ' + CONFIG.APP_TITLE + ' BPS-' + CONFIG.KODE_SATKER + ' ' + Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH.mm');
  const baru = SpreadsheetApp.create(nama);
  const sh = baru.getSheets()[0];
  sh.setName('DATA');
  sh.getRange(1, 1, data.length, data[0].length).setValues(data);
  sh.getRange(1, 1, 1, data[0].length).setFontWeight('bold');
  SpreadsheetApp.flush();
  return {
    nama: nama,
    baris: data.length - 1,
    url: baru.getUrl(),
    xlsx: 'https://docs.google.com/spreadsheets/d/' + baru.getId() + '/export?format=xlsx'
  };
}

/** Pemicu sederhana: centang Selesai manual di sheet → catat waktunya. */
function onEdit(e) {
  try {
    const sh = e.range.getSheet();
    if (sh.getName() !== sheetData_().getName() || e.range.getRow() < 2) return;
    const m = petaKolom_(header_(sh));
    if (m.selesai < 0 || m.waktu < 0 || e.range.getColumn() !== m.selesai + 1 || e.range.getNumRows() > 1) return;
    const sel = sh.getRange(e.range.getRow(), m.waktu + 1);
    if (e.value === 'TRUE' && !sel.getValue()) sel.setValue(new Date());
  } catch (err) { /* abaikan */ }
}

/**
 * Catatan FASIH per assignment_id: { id: [{jenis, teks}] }, atau null bila sheet catatan tidak ada.
 */
function bacaCatatan_() {
  const LABEL = {
    catatan_kunjungan_1: 'Kunjungan 1', catatan_kunjungan_2: 'Kunjungan 2', catatan_kunjungan_3: 'Kunjungan 3',
    catatan_pml: 'PML', catatan_umum: 'Umum', catatan_anomali_admin: 'Anomali admin'
  };
  const ss = ss_();
  let sh = CONFIG.SHEET_CATATAN ? ss.getSheetByName(CONFIG.SHEET_CATATAN) : null;
  if (!sh) {
    const all = ss.getSheets();
    for (let i = 0; i < all.length && !sh; i++) {
      if (all[i].getLastRow() < 2 || all[i].getLastColumn() < 2) continue;
      const norm = header_(all[i]).map(normal_);
      if (norm.indexOf('assignment_id') >= 0 && norm.indexOf('catatan_umum') >= 0) sh = all[i];
    }
  }
  if (!sh) return null;
  const values = sh.getDataRange().getValues();
  const norm = values[0].map(normal_);
  const ci = norm.indexOf('assignment_id');
  const kol = Object.keys(LABEL).map(function (k) { return [k, norm.indexOf(k)]; }).filter(function (x) { return x[1] >= 0; });
  const peta = {};
  for (let i = 1; i < values.length; i++) {
    const id = teksSel_(values[i][ci]);
    if (!id) continue;
    kol.forEach(function (x) {
      const t = teksSel_(values[i][x[1]]);
      if (!t || t === '-') return;
      const arr = peta[id] || (peta[id] = []);
      if (!arr.some(function (a) { return a.jenis === LABEL[x[0]] && a.teks === t; })) arr.push({ jenis: LABEL[x[0]], teks: t });
    });
  }
  return peta;
}

/* ================================================================ hitungan */

/** v = nilai tahunan. */
function hitung_(v) {
  const n = function (x) { return Number(x) || 0; };
  const output = n(v.pendapatan) - n(v.beli);
  const biayaAntara = n(v.produksi) + n(v.operasional);
  const ntb = output - biayaAntara;
  const totalBiaya = n(v.upah) + n(v.produksi) + n(v.beli) + n(v.operasional) + n(v.nonop);
  const totalPendapatan = n(v.pendapatan) + n(v.lain);
  return {
    output: output, biayaAntara: biayaAntara, ntb: ntb,
    rasio: output > 0 ? ntb / output : null,
    totalBiaya: totalBiaya, totalPendapatan: totalPendapatan, selisih: totalPendapatan - totalBiaya
  };
}

/** Jumlah hari kerja dari hari ini sampai batas waktu (termasuk keduanya). */
function hariKerjaSisa_(dari, sampai) {
  const a = new Date(dari + 'T00:00:00Z'), b = new Date(sampai + 'T00:00:00Z');
  let n = 0;
  for (let d = a; d <= b; d = new Date(d.getTime() + 86400000)) {
    const w = d.getUTCDay();
    if (CONFIG.HITUNG_SABTU_MINGGU || (w !== 0 && w !== 6)) n++;
  }
  return n;
}

/* ================================================================ Log Koreksi (TUNTAS) */

function kolomTuntas_() {
  const k = CONFIG.DATAKEY, b = CONFIG.DATAKEY_BULANAN;
  const keys = [k.upah, k.produksi, k.beli, k.operasional, k.nonop, k.pendapatan, k.lain,
    b.upah, b.produksi, b.beli, b.operasional, b.nonop, b.pendapatan, b.lain];
  return ['link_fasih_sm', 'assignment_id', 'nama_usaha', 'kode_catatan'].concat(keys.filter(function (x, i) {
    return x && keys.indexOf(x) === i;
  }));
}

/**
 * Satu baris per usaha yang sudah diperiksa.
 * - Angka berubah dari FASIH → hanya variabel yang berubah diisi (nilai baru), kode_catatan = #1–#4.
 * - Remark #0 → variabel di CONFIG.VARIABEL_REMARK_0 diisi nilai yang sama (tidak berubah),
 *   kode_catatan = #0, supaya bot TUNTAS tetap memberi remark #0 di variabel itu.
 * Nilai dalam satuan FASIH (per bulan untuk usaha tahun 2026).
 */
function isiTuntas_(rec, asli, baru, remark, head) {
  const f = rec.faktor;
  const keyOf = function (k) { return f !== 1 ? (CONFIG.DATAKEY_BULANAN[k] || CONFIG.DATAKEY[k]) : CONFIG.DATAKEY[k]; };
  const isi = head.map(function () { return ''; });
  let kode = kodeRemark_(remark);
  let ada = false;
  ISIAN.forEach(function (k) {
    if (Number(asli[k]) === Number(baru[k])) return;
    const c = head.indexOf(keyOf(k));
    if (c < 0) return;
    isi[c] = Math.round((Number(baru[k]) || 0) / f);
    ada = true;
  });
  if (ada) {
    if (!/^#[1-9]$/.test(kode)) kode = '#1';
  } else {
    if (!kode) return null;
    kode = '#0';
    (CONFIG.VARIABEL_REMARK_0 || []).forEach(function (k) {
      const c = head.indexOf(keyOf(k));
      if (c >= 0) isi[c] = Math.round((Number(baru[k]) || 0) / f);
    });
  }
  isi[head.indexOf('link_fasih_sm')] = rec.link;
  isi[head.indexOf('assignment_id')] = rec.id;
  isi[head.indexOf('nama_usaha')] = rec.nama;
  isi[head.indexOf('kode_catatan')] = kode;
  return isi;
}

function sheetTuntas_() {
  const ss = ss_();
  const header = kolomTuntas_();
  let sh = ss.getSheetByName(CONFIG.SHEET_TUNTAS);
  if (!sh) {
    sh = ss.insertSheet(CONFIG.SHEET_TUNTAS);
    sh.setFrozenRows(1);
  }
  const head = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), 1)).getValues()[0].map(function (x) { return String(x).trim(); });
  if (head.join('|') !== header.join('|')) {
    if (sh.getLastRow() > 0) sh.clear();
    sh.getRange(1, 1, 1, header.length).setValues([header]).setFontWeight('bold');
    return { sh: sh, head: header };
  }
  return { sh: sh, head: head };
}

function tulisTuntas_(rec, asli, baru, remark) {
  const t = sheetTuntas_();
  const sh = t.sh, head = t.head;
  let baris = -1;
  const last = sh.getLastRow();
  if (last >= 2) {
    const temu = sh.getRange(2, 2, last - 1, 1).createTextFinder(rec.id).matchEntireCell(true).findAll();
    for (let i = 0; i < temu.length && baris < 0; i++) {
      const rr = temu[i].getRow();
      if (String(sh.getRange(rr, 3).getValue()).trim() === rec.nama) baris = rr;
    }
  }
  const row = isiTuntas_(rec, asli, baru, remark, head);
  if (!row) { if (baris > 0) sh.deleteRow(baris); return; }
  if (baris > 0) sh.getRange(baris, 1, 1, row.length).setValues([row]);
  else sh.appendRow(row);
}

/**
 * Jalankan dari editor bila perlu: menyusun ulang seluruh sheet Log Koreksi
 * dari semua baris Database yang sudah punya REMARK.
 */
function susunUlangLogKoreksi() {
  const sh = sheetData_();
  const values = sh.getDataRange().getValues();
  const m = petaKolom_(values[0]);
  const t = sheetTuntas_();
  const out = [];
  for (let i = 1; i < values.length; i++) {
    if (!teksSel_(values[i][m.id]) || m.remark < 0 || !teksSel_(values[i][m.remark])) continue;
    const rec = rekam_(values[i], m, i + 1);
    const row = isiTuntas_(rec, rec.asli || rec.v, rec.v, rec.remark, t.head);
    if (row) out.push(row);
  }
  if (t.sh.getLastRow() > 1) t.sh.getRange(2, 1, t.sh.getLastRow() - 1, t.head.length).clearContent();
  if (out.length) t.sh.getRange(2, 1, out.length, t.head.length).setValues(out);
  Logger.log('Log Koreksi disusun ulang: ' + out.length + ' baris.');
}

/* ================================================================ bantuan */

function ss_() {
  return CONFIG.SPREADSHEET_ID ? SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
}

function sheetData_() {
  const ss = ss_();
  if (CONFIG.SHEET_DATA) {
    const sh = ss.getSheetByName(CONFIG.SHEET_DATA);
    if (sh) return sh;
  }
  const all = ss.getSheets();
  for (let i = 0; i < all.length; i++) {
    if (all[i].getLastRow() < 2 || all[i].getLastColumn() < 1) continue;
    const m = petaKolom_(header_(all[i]));
    if (m.id >= 0 && m.pendapatan >= 0) return all[i];
  }
  throw new Error('Sheet data tidak ditemukan. Periksa CONFIG.SHEET_DATA.');
}

function header_(sh) {
  return sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), 1)).getValues()[0];
}

function normal_(h) {
  return String(h === null || h === undefined ? '' : h).trim().toLowerCase().replace(/\s+/g, '_');
}

function teksSel_(x) {
  return x === null || x === undefined ? '' : String(x).trim();
}

function petaKolom_(headers) {
  const norm = headers.map(normal_);
  const m = {};
  Object.keys(KOLOM).forEach(function (k) {
    m[k] = -1;
    for (let a = 0; a < KOLOM[k].length && m[k] < 0; a++) m[k] = norm.indexOf(KOLOM[k][a]);
  });
  return m;
}

function siapkanKolom_(sh, m) {
  let col = sh.getLastColumn();
  Object.keys(KOLOM_BARU).forEach(function (k) {
    if (m[k] >= 0) return;
    col++;
    if (col > sh.getMaxColumns()) sh.insertColumnAfter(sh.getMaxColumns());
    sh.getRange(1, col).setValue(KOLOM_BARU[k]).setFontWeight('bold');
    m[k] = col - 1;
  });
  return m;
}

function cariBaris_(sh, m, p) {
  const id = String(p.id || '').trim();
  const nama = String(p.nama || '').trim();
  const lastRow = sh.getLastRow();
  const cocok = function (r) {
    if (r < 2 || r > lastRow) return false;
    const vals = sh.getRange(r, 1, 1, sh.getLastColumn()).getValues()[0];
    return teksSel_(vals[m.id]) === id && (m.nama < 0 || teksSel_(vals[m.nama]) === nama);
  };
  if (cocok(Number(p.row))) return Number(p.row);
  const hasil = sh.getRange(2, m.id + 1, lastRow - 1, 1).createTextFinder(id).matchEntireCell(true).findAll();
  for (let i = 0; i < hasil.length; i++) if (cocok(hasil[i].getRow())) return hasil[i].getRow();
  throw new Error('Berkas ' + id + ' (' + nama + ') tidak ditemukan. Muat ulang data.');
}

function selesai_(row, m) {
  if (m.selesai >= 0) {
    const s = row[m.selesai];
    if (s === true || /^(true|ya|sudah|1)$/i.test(teksSel_(s))) return true;
  }
  return m.remark >= 0 && !!teksSel_(row[m.remark]);
}

function kodeRemark_(s) {
  const t = teksSel_(s);
  const k = t.split(':')[0].trim();
  return /^#\d$/.test(k) ? k : (t ? t : '');
}

function rekam_(row, m, rowNumber) {
  const teks = function (k) {
    if (m[k] < 0) return '';
    const x = row[m[k]];
    if (x instanceof Date) return Utilities.formatDate(x, Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm');
    return teksSel_(x);
  };
  let kbli = teks('kbli');
  if (/^\d+(\.0+)?$/.test(kbli)) kbli = String(parseInt(kbli, 10)).padStart(5, '0');
  const kat = (teks('kategori') || kategoriDariKbli_(kbli)).toUpperCase();
  const tahun = teks('tahun').replace(/\.0+$/, '');
  const faktor = CONFIG.TAHUN_BULANAN.indexOf(tahun) >= 0 ? 12 : 1;
  const b = CONFIG.BATAS_KATEGORI[kat] || CONFIG.BATAS_UMUM;

  const v = {};
  ISIAN.forEach(function (k) { v[k] = m[k] >= 0 ? angka_(row[m[k]]) : 0; });
  let asli = null;
  if (m.asli >= 0 && teksSel_(row[m.asli])) { try { asli = JSON.parse(row[m.asli]); } catch (e) { asli = null; } }
  const link = teks('link');

  return {
    r: rowNumber,
    id: teks('id'),
    link: /^https?:\/\//i.test(link) ? link : '',
    nama: teks('nama'),
    kat: kat,
    kbli: kbli,
    kec: teks('kec'),
    desa: teks('desa'),
    tahun: tahun,
    faktor: faktor,
    tk: m.tk >= 0 ? angka_(row[m.tk]) : null,
    catatan: teks('catatan'),
    pemeriksa: teks('pemeriksa'),
    selesai: selesai_(row, m),
    remark: teks('remark'),
    oleh: teks('oleh'),
    waktu: teks('waktu'),
    lo: b[0],
    hi: b[1],
    v: v,
    asli: asli
  };
}

function angka_(x) {
  if (typeof x === 'number') return isFinite(x) ? x : 0;
  let s = String(x === null || x === undefined ? '' : x).replace(/[^\d,.\-]/g, '');
  if (!s) return 0;
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(',', '.');
  const n = parseFloat(s);
  return isFinite(n) ? n : 0;
}

function bulat_(x, d) {
  const p = Math.pow(10, d);
  return Math.round(x * p) / p;
}

function kategoriDariKbli_(kbli) {
  const d = parseInt(String(kbli || '').slice(0, 2), 10);
  if (!d) return '';
  const tabel = [[3, 'A'], [9, 'B'], [33, 'C'], [35, 'D'], [39, 'E'], [43, 'F'], [47, 'G'], [53, 'H'],
    [56, 'I'], [63, 'J'], [66, 'K'], [68, 'L'], [75, 'M'], [82, 'N'], [84, 'O'], [85, 'P'],
    [88, 'Q'], [93, 'R'], [96, 'S'], [98, 'T'], [99, 'U']];
  for (let i = 0; i < tabel.length; i++) if (d <= tabel[i][0]) return tabel[i][1];
  return '';
}
