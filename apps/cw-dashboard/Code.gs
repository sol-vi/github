/**
 * CRAFT WONDER DASHBOARD — GAS backend
 * ---------------------------------------------------------------------------
 * データソース : Google Spreadsheet
 * バックエンド : Google Apps Script（このファイル）
 * フロント     : Index.html / Styles.html / Scripts.html
 *
 * 設計方針（引き継ぎ書 §2.5）
 *  - ローデータはSpreadsheet側に保持し、HTMLへ固定値として埋め込まない
 *  - 取得・整形・表記ゆれ補正・フィルター候補生成はGAS側で行う
 *  - 集計のうち「フィルター条件に依存するもの」はJavaScript側が担当する
 *
 * 想定シート（docs/cw-dashboard-b2b.md に列定義あり）
 *   RAW_B2B         受注明細ローデータ（必須。粗利は「購入価格」列から算出）
 *   Product_Master  商品名の正規化・カテゴリ（任意 / 無ければ規則ベースで補完）
 *   Config          動作設定（任意 / 無ければ既定値）
 */

/* eslint-disable no-var */

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

/** 区分の空欄を表すラベル。構成品の判定に使うので定数化する。 */
var BLANK_SEGMENT = '未入力';

var SHEET_RAW_B2B = 'RAW_B2B';
var SHEET_RAW_INVENTORY = 'RAW_Inventory';
var SHEET_PRODUCT_MASTER = 'Product_Master';
var SHEET_CONFIG = 'Config';

/** RAW_Inventory の見出し。WMSの在庫明細エクスポートの列名をそのまま使う。 */
var INV = {
  ownerName: '荷主名',
  siteName: '拠点名',
  itemCode: '商品コード',
  itemName: '商品名',
  jan: 'JANコード',
  category: 'カテゴリー名',
  supplier: '仕入先名',
  stock: '在庫数',
  unit: '数量単位',
  allocated: '引当数',
  free: '未引当数',
  received: '入荷実績数',
  shipped: '出荷実績数',
  lotNo: 'ロットNo',
  producedOn: '製造日',
  bestBefore: '賞味期限',
  arrivedOn: '入荷日',
  stockType: '在庫区分名',
  lastIn: '最終入庫日',
  lastOut: '最終出庫日'
};

/** RAW_B2B に必須の見出し。CSVエクスポートの列名をそのまま使う。 */
var COL = {
  status: 'ステータス',
  orderDate: '日付',
  shipDate: '出荷予定日',
  orderNo: '受注書番号',
  lead: 'リード種別',
  repeat: '新規/リピート',
  customerType: '顧客種別',
  ecDetail: 'EC（他社サイト）の詳細',
  customer: '顧客名',
  owner: '営業担当者',
  orderId: '受注書ID',
  adjust: '調整',
  shipping: '配送料',
  orderTotal: '合計',
  invoiceDate: '請求日',
  product: '商品名',
  segment: '区分',
  unitPrice: '販売価格',
  qty: '発注数',
  discountRate: '割引（%）',
  discountAmount: '割引額',
  grossTotal: '総額',
  fcyTotal: '合計（FCY）',
  lineSales: '小計',
  taxIncluded: '税込みの総額',
  // 2026-09-03 のエクスポートから追加された列。粗利はここから算出する。
  purchasePrice: '購入価格',
  sku: 'SKU（在庫保管単位）',
  itemKind: '商品の種類',
  prefecture: '都道府県（納品先）',
  salesRoute: '売上の経路'
};

/** Config シートが無い場合の既定値。 */
var DEFAULT_CONFIG = {
  // 対象とする顧客種別。空 = 全件（既定）。
  // 特定チャネルだけに絞りたい場合は Config で列挙する。
  b2bCustomerTypes: [],
  // 集計対象とする受注ステータス。
  includeStatuses: ['確定済み', '完了'],
  // 行を除外するステータス（合計行など）。
  excludeStatuses: ['合計'],
  // 未入力ラベル。
  blankLabel: '未入力',
  // フォロー候補と判定する「平均発注間隔超過」の下限日数。
  followOverdueDays: 0,

  // --- 在庫ページのしきい値 ---
  // 在庫日数（有効在庫 ÷ 日次平均出庫）がこの日数未満なら「要補充」。
  inventoryLowDays: 14,
  // 在庫日数がこの日数以下なら「適正」、超えたら「過剰」。
  inventoryHealthyDays: 90,
  // 在庫日数がこの日数を超えたら「大幅過剰」。
  inventoryExcessDays: 365,
  // 最終出庫日からこの日数を超えて動きがなければ「滞留」。
  inventoryStagnantDays: 90,
  // 賞味期限の残日数がこの日数以下なら「期限接近」。
  inventoryExpirySoonDays: 90
};

// ---------------------------------------------------------------------------
// エントリポイント
// ---------------------------------------------------------------------------

/**
 * Webアプリのエントリポイント。
 * ?page=b2b / ?page=inventory のようにページを切り替える。
 */
var PAGE_TEMPLATES = {
  b2b: 'Index',
  inventory: 'Inventory'
};

function doGet(e) {
  var page = (e && e.parameter && e.parameter.page) || 'b2b';
  var template = PAGE_TEMPLATES[page] || PAGE_TEMPLATES.b2b;
  var t = HtmlService.createTemplateFromFile(template);
  t.page = page;
  return t
    .evaluate()
    .setTitle('CRAFT WONDER DASHBOARD')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** Index.html から Styles / Scripts を取り込むためのヘルパー。 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * フロントから呼ばれる唯一のデータ取得口。
 *
 *   google.script.run
 *     .withSuccessHandler(renderDashboard)
 *     .withFailureHandler(handleError)
 *     .getDashboardData({ page: 'b2b' });
 */
function getDashboardData(options) {
  var page = (options && options.page) || 'b2b';
  switch (page) {
    case 'b2b':
      return getB2BData();
    case 'inventory':
      return getInventoryData();
    default:
      throw new Error('未対応のページです: ' + page);
  }
}

// ---------------------------------------------------------------------------
// 業務店営業（B2B）
// ---------------------------------------------------------------------------

/**
 * 業務用・飲食店 受注売上ダッシュボード用のペイロードを組み立てる。
 * 返り値の形はフロントとの契約なので、変更時は Scripts.html も併せて更新すること。
 */
function getB2BData() {
  var config = readConfig_();
  var master = readProductMaster_();
  var table = readSheetAsObjects_(SHEET_RAW_B2B);

  var normalized = normalizeData_(table.rows, master, config);
  var rows = normalized.rows;

  // 業務店スコープの絞り込み。Config で顧客種別を差し替えられる。
  var scopeTypes = config.b2bCustomerTypes;
  var scoped = rows;
  if (scopeTypes && scopeTypes.length) {
    var allow = {};
    scopeTypes.forEach(function (v) { allow[v] = true; });
    scoped = rows.filter(function (r) { return allow[r.customerType]; });
  }

  var dates = scoped
    .map(function (r) { return r.orderDate; })
    .filter(Boolean)
    .sort();

  return {
    meta: {
      page: 'b2b',
      title: '業務用・飲食店 受注売上ダッシュボード',
      eyebrow: 'CRAFT WONDER / B2B SALES',
      generatedAt: Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm'),
      sheet: SHEET_RAW_B2B,
      sourceRows: table.rows.length,
      rowCount: scoped.length,
      orderCount: countUnique_(scoped, 'orderNo'),
      customerCount: countUnique_(scoped, 'customer'),
      coverageFrom: dates.length ? dates[0] : '',
      coverageTo: dates.length ? dates[dates.length - 1] : '',
      scopeCustomerTypes: scopeTypes,
      includeStatuses: config.includeStatuses,
      hasProductMaster: master.hasMaster,
      shippingTotal: sumOrderShipping_(scoped),
      setAllocation: normalized.setAllocation,
      costCoverage: normalized.costCoverage,
      costNotice: master.costNotice,
      warnings: normalized.warnings
    },
    options: buildOptions_(scoped),
    rows: scoped
  };
}

// ---------------------------------------------------------------------------
// 在庫（SCM）
// ---------------------------------------------------------------------------

/**
 * 在庫ダッシュボード用のペイロードを組み立てる。
 *
 * RAW_Inventory は WMS のロット単位エクスポート（1行 = 1ロット）。
 * 単価と出庫ペースは RAW_B2B 側にしかないため、
 * SKU（在庫保管単位）＝ 在庫側の商品コード で突き合わせる。
 * 商品名は在庫側と受注側で表記が全く違う（★■▲の接頭辞・全角スペース等）ので使わない。
 */
function getInventoryData() {
  var config = readConfig_();
  var master = readProductMaster_();
  var invTable = readSheetAsObjects_(SHEET_RAW_INVENTORY);
  var salesTable = readSheetAsObjects_(SHEET_RAW_B2B, true);

  var demand = buildDemandBySku_(salesTable.rows, config);
  var lots = [];
  var warnings = [];
  var skippedEmpty = 0;

  for (var i = 0; i < invTable.rows.length; i++) {
    var r = invTable.rows[i];
    var code = text_(r[INV.itemCode]);
    if (!code) { skippedEmpty++; continue; }

    var hit = demand.bySku[code] || null;
    var resolved = master.resolve(hit ? hit.product : text_(r[INV.itemName]));

    lots.push({
      sku: code,
      // 商品名は受注側の名前を優先する。ページ間で同じ表記に揃えるため。
      product: hit ? hit.product : text_(r[INV.itemName]),
      warehouseName: text_(r[INV.itemName]),
      matched: !!hit,
      category: resolved.category,
      itemType: resolved.itemType,
      site: text_(r[INV.siteName]) || config.blankLabel,
      supplier: text_(r[INV.supplier]) || config.blankLabel,
      stockType: text_(r[INV.stockType]) || config.blankLabel,
      lotNo: text_(r[INV.lotNo]) || config.blankLabel,
      stock: parseNumber_(r[INV.stock]),
      allocated: parseNumber_(r[INV.allocated]),
      free: parseNumber_(r[INV.free]),
      received: parseNumber_(r[INV.received]),
      shipped: parseNumber_(r[INV.shipped]),
      bestBefore: toIsoDate_(r[INV.bestBefore]),
      arrivedOn: toIsoDate_(r[INV.arrivedOn]),
      lastIn: toIsoDate_(r[INV.lastIn]),
      lastOut: toIsoDate_(r[INV.lastOut]),
      unitCost: hit ? hit.unitCost : 0,
      hasCost: !!(hit && hit.unitCost > 0)
    });
  }

  if (skippedEmpty) {
    warnings.push('商品コードが空の ' + skippedEmpty + ' 行を除外しました。');
  }

  var unmatched = {};
  lots.forEach(function (l) { if (!l.hasCost) unmatched[l.product] = true; });
  var unmatchedNames = Object.keys(unmatched);
  if (unmatchedNames.length) {
    warnings.push(
      '受注データと突き合わない商品が ' + unmatchedNames.length + ' 件あります。' +
      '在庫数量は集計しますが、単価が取れないため在庫金額と在庫日数は算出できません。'
    );
  }

  return {
    meta: {
      page: 'inventory',
      title: '在庫ダッシュボード',
      eyebrow: 'CRAFT WONDER / SCM INVENTORY',
      generatedAt: Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm'),
      sheet: SHEET_RAW_INVENTORY,
      sourceRows: invTable.rows.length,
      lotCount: lots.length,
      skuCount: countUnique_(lots, 'sku'),
      matchedSkus: countUnique_(lots.filter(function (l) { return l.hasCost; }), 'sku'),
      // 出庫ペースの分母。受注データの期間（日数）。
      demandDays: demand.days,
      demandFrom: demand.from,
      demandTo: demand.to,
      thresholds: {
        low: config.inventoryLowDays,
        healthy: config.inventoryHealthyDays,
        excess: config.inventoryExcessDays,
        stagnant: config.inventoryStagnantDays,
        expirySoon: config.inventoryExpirySoonDays
      },
      warnings: warnings
    },
    options: buildInventoryOptions_(lots),
    demand: demand.bySku,
    rows: lots
  };
}

/**
 * SKU ごとの出庫実績を受注データから作る。
 * 在庫日数の分母になるので、期間の日数も一緒に返す。
 */
function buildDemandBySku_(salesRows, config) {
  var include = {};
  (config.includeStatuses || []).forEach(function (v) { include[v] = true; });
  var exclude = {};
  (config.excludeStatuses || []).forEach(function (v) { exclude[v] = true; });

  var bySku = {};
  var dates = [];

  salesRows.forEach(function (r) {
    var status = text_(r[COL.status]);
    if (exclude[status]) return;
    if (Object.keys(include).length && !include[status]) return;

    var sku = text_(r[COL.sku]);
    if (!sku) return;

    if (!bySku[sku]) {
      bySku[sku] = { sku: sku, product: '', qty: 0, orders: 0, unitCost: 0, lastOrder: '' };
    }
    var a = bySku[sku];
    var name = text_(r[COL.product]);
    if (name && !a.product) a.product = name;

    var cost = parseNumber_(r[COL.purchasePrice]);
    if (cost > 0) a.unitCost = cost;

    a.qty += parseNumber_(r[COL.qty]);
    a.orders++;

    var d = toIsoDate_(r[COL.orderDate]);
    if (d) {
      dates.push(d);
      if (d > a.lastOrder) a.lastOrder = d;
    }
  });

  dates.sort();
  var from = dates.length ? dates[0] : '';
  var to = dates.length ? dates[dates.length - 1] : '';
  var days = 1;
  if (from && to) {
    days = Math.max(1, Math.round(
      (new Date(to + 'T00:00:00') - new Date(from + 'T00:00:00')) / 86400000
    ) + 1);
  }

  Object.keys(bySku).forEach(function (k) {
    bySku[k].dailyOut = bySku[k].qty / days;
  });

  return { bySku: bySku, days: days, from: from, to: to };
}

function buildInventoryOptions_(lots) {
  var keys = ['category', 'itemType', 'product', 'supplier', 'site', 'stockType'];
  var out = {};
  keys.forEach(function (key) {
    var counts = {};
    lots.forEach(function (l) {
      var v = l[key];
      if (!v) return;
      counts[v] = (counts[v] || 0) + 1;
    });
    out[key] = Object.keys(counts)
      .map(function (v) { return { value: v, count: counts[v] }; })
      .sort(function (a, b) {
        return b.count - a.count || a.value.localeCompare(b.value, 'ja');
      });
  });
  return out;
}

// ---------------------------------------------------------------------------
// 正規化
// ---------------------------------------------------------------------------

/**
 * ローデータを1行=1明細のプレーンオブジェクトへ整形する。
 * ここで表記ゆれ補正・型変換・区分の空欄補完まで済ませ、
 * フロント側では「集計」だけを行える状態にする。
 */
function normalizeData_(raw, master, config) {
  var warnings = [];
  var skippedStatus = 0;
  var skippedNoProduct = 0;
  var renamedProducts = {};
  var trimmedTypes = 0;

  var include = {};
  (config.includeStatuses || []).forEach(function (s) { include[s] = true; });
  var exclude = {};
  (config.excludeStatuses || []).forEach(function (s) { exclude[s] = true; });

  var out = [];

  for (var i = 0; i < raw.length; i++) {
    var r = raw[i];
    var status = text_(r[COL.status]);

    if (exclude[status]) { skippedStatus++; continue; }
    if (Object.keys(include).length && !include[status]) { skippedStatus++; continue; }

    var productRaw = text_(r[COL.product]);
    if (!productRaw) { skippedNoProduct++; continue; }

    var resolved = master.resolve(productRaw);
    if (resolved.name !== productRaw) {
      renamedProducts[productRaw] = resolved.name;
    }

    // 原価は明細の「購入価格」を一次情報とする。
    // Product_Master の原価は、購入価格が空の商品を補うときだけ使う。
    var purchaseText = text_(r[COL.purchasePrice]);
    var unitCost = purchaseText !== '' ? parseNumber_(purchaseText) : resolved.cost;
    var hasCost = purchaseText !== '' || resolved.hasCost;

    var customerTypeRaw = text_(r[COL.customerType]);
    var customerType = customerTypeRaw.replace(/\s+/g, ' ').trim();
    if (customerType !== customerTypeRaw) trimmedTypes++;

    out.push({
      status: status,
      orderDate: toIsoDate_(r[COL.orderDate]),
      shipDate: toIsoDate_(r[COL.shipDate]),
      invoiceDate: toIsoDate_(r[COL.invoiceDate]),
      orderNo: text_(r[COL.orderNo]) || config.blankLabel,
      lead: text_(r[COL.lead]) || config.blankLabel,
      repeat: text_(r[COL.repeat]) || config.blankLabel,
      customerType: customerType || config.blankLabel,
      customer: text_(r[COL.customer]) || config.blankLabel,
      owner: text_(r[COL.owner]) || config.blankLabel,
      ecDetail: text_(r[COL.ecDetail]),
      product: resolved.name,
      productRaw: productRaw,
      category: resolved.category,
      itemType: resolved.itemType,
      unitCost: unitCost,
      lineCost: unitCost * parseNumber_(r[COL.qty]),
      // allocatedCost はセット構成品の原価をセット商品へ寄せたあとの原価。
      // 受注内の合計は lineCost と一致するので、集計は常にこちらを使う。
      allocatedCost: unitCost * parseNumber_(r[COL.qty]),
      costAllocation: '',
      isSetComponent: false,
      hasCost: hasCost,
      sku: text_(r[COL.sku]),
      itemKind: text_(r[COL.itemKind]),
      prefecture: text_(r[COL.prefecture]),
      segment: text_(r[COL.segment]) || config.blankLabel,
      qty: parseNumber_(r[COL.qty]),
      unitPrice: parseNumber_(r[COL.unitPrice]),
      discountAmount: parseNumber_(r[COL.discountAmount]),
      // 売上（税抜）は AQ列「総額」＝ 販売価格×発注数 − 割引額。
      // AS列「小計」は割引前なので、定価売上として別に持つ。
      lineSales: parseNumber_(r[COL.grossTotal]),
      listSales: parseNumber_(r[COL.lineSales]),
      orderTotal: parseNumber_(r[COL.orderTotal]),
      shipping: parseNumber_(r[COL.shipping])
    });
  }

  if (skippedStatus) {
    warnings.push('対象外ステータスの ' + skippedStatus + ' 行を除外しました。');
  }
  if (skippedNoProduct) {
    warnings.push('商品名が空の ' + skippedNoProduct + ' 行を除外しました。');
  }
  // 原価カバレッジ。「購入価格が空」と「購入価格が¥0」は別物として扱う。
  //  - 空          → 原価不明。粗利が過大に出る
  //  - ¥0（セット） → 原価は構成品行に分離されている。合算すれば正しい
  var costed = {};
  var uncosted = {};
  var zeroCostSold = {};
  out.forEach(function (r) {
    (r.hasCost ? costed : uncosted)[r.product] = true;
    if (r.hasCost && r.unitCost === 0 && r.lineSales > 0) zeroCostSold[r.product] = true;
  });
  var uncostedNames = Object.keys(uncosted);
  // 「購入価格が空」「購入価格¥0で売上あり」はスコープ絞り込み後の件数で
  // 画面上部のバナーに出す。ここで warnings に足すと全データ基準の件数になり、
  // バナーと数字が食い違うため出さない。
  var zeroNames = Object.keys(zeroCostSold);

  var renamedCount = Object.keys(renamedProducts).length;
  if (renamedCount) {
    warnings.push('商品名の表記ゆれ ' + renamedCount + ' 件を正規化しました。');
  }
  if (trimmedTypes) {
    warnings.push('顧客種別の前後空白 ' + trimmedTypes + ' 件を補正しました。');
  }
  if (!master.hasMaster) {
    warnings.push('Product_Master シートが無いため、商品カテゴリは商品名の【…】表記から自動判定しています。');
  }

  var alloc = allocateSetCosts_(out);
  if (alloc.proratedOrders) {
    warnings.push(
      'ギフトセットが複数ある ' + alloc.proratedOrders + ' 受注では、構成品原価 ¥' +
      Math.round(alloc.proratedCost).toLocaleString('ja-JP') +
      ' をセットの発注数比で按分しています（商品別粗利率のみ概算。受注・全体の合計は正確）。'
    );
  }

  return {
    rows: out,
    warnings: warnings,
    setAllocation: alloc,
    costCoverage: {
      withCost: Object.keys(costed).length,
      total: Object.keys(costed).length + uncostedNames.length,
      uncosted: uncostedNames,
      zeroCostSold: zeroNames
    }
  };
}

/** 公開用ラッパー（引き継ぎ書のGAS構成に合わせた名前）。 */
function normalizeData(raw) {
  return normalizeData_(raw, readProductMaster_(), readConfig_()).rows;
}

/**
 * "¥4,900" / "1,200" / 12 / "" などを数値へ。
 * 解釈できない場合は 0 を返す（欠損で合計が壊れないようにする）。
 */
function parseNumber_(v) {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  var s = String(v)
    .replace(/[¥￥,\s]/g, '')
    .replace(/[（(]([\d.]+)[)）]/, '-$1'); // (1,200) 形式の負数
  var n = parseFloat(s);
  return isFinite(n) ? n : 0;
}

/** 公開用ラッパー。 */
function parseNumber(v) {
  return parseNumber_(v);
}

/** Date / "2026/06/01" / "2026-06-01" を "YYYY-MM-DD" へ。 */
function toIsoDate_(v) {
  if (!v && v !== 0) return '';
  if (Object.prototype.toString.call(v) === '[object Date]') {
    if (isNaN(v.getTime())) return '';
    return Utilities.formatDate(v, 'Asia/Tokyo', 'yyyy-MM-dd');
  }
  var s = String(v).trim();
  if (!s) return '';
  var m = s.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/);
  if (!m) return '';
  return m[1] + '-' + pad2_(m[2]) + '-' + pad2_(m[3]);
}

function pad2_(n) { return ('0' + n).slice(-2); }

function text_(v) {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

// ---------------------------------------------------------------------------
// セット商品と構成品の紐づけ
// ---------------------------------------------------------------------------

/**
 * ギフトセットの原価を、同じ受注内の構成品行から寄せる。
 *
 * データ構造：
 *   セット商品（商品の種類 = 販売項目）は売上だけを持ち、購入価格は¥0。
 *   その原価は同じ受注内の「在庫項目 かつ 売上¥0 かつ 区分が空欄」の行に入る。
 *   区分が空欄の売上¥0行はセットのある受注にしか現れないため（セット無しの
 *   受注では0件）、区分でサンプル・協賛・イベントと確実に切り分けられる。
 *
 * 受注内の原価合計は変えないので、受注単位・店舗別・全体の数値は不変。
 * 変わるのは商品別・カテゴリ別・区分別の内訳だけ。
 */
function allocateSetCosts_(rows) {
  var byOrder = {};
  rows.forEach(function (r) {
    (byOrder[r.orderNo] = byOrder[r.orderNo] || []).push(r);
  });

  var stats = {
    exactOrders: 0, exactCost: 0,
    proratedOrders: 0, proratedCost: 0,
    componentRows: 0
  };

  Object.keys(byOrder).forEach(function (orderNo) {
    var rs = byOrder[orderNo];
    var sets = rs.filter(function (r) { return r.itemKind === '販売項目'; });
    var comps = rs.filter(function (r) {
      return r.itemKind === '在庫項目' && r.lineSales <= 0 && r.segment === BLANK_SEGMENT;
    });
    if (!sets.length || !comps.length) return;

    var pool = 0;
    comps.forEach(function (r) { pool += r.allocatedCost; });
    if (pool <= 0) return;

    comps.forEach(function (r) {
      r.allocatedCost = 0;
      r.isSetComponent = true;
    });
    stats.componentRows += comps.length;

    if (sets.length === 1) {
      sets[0].allocatedCost += pool;
      sets[0].costAllocation = 'exact';
      stats.exactOrders++;
      stats.exactCost += pool;
    } else {
      // セットが複数あると、どの構成品がどのセットのものか特定できない。
      // 発注数比で按分し、概算であることを costAllocation で示す。
      var totalQty = 0;
      sets.forEach(function (r) { totalQty += r.qty; });
      if (!totalQty) totalQty = sets.length;
      sets.forEach(function (r) {
        r.allocatedCost += pool * ((r.qty || 1) / totalQty);
        r.costAllocation = 'prorated';
      });
      stats.proratedOrders++;
      stats.proratedCost += pool;
    }
  });

  return stats;
}

// ---------------------------------------------------------------------------
// 商品マスタ
// ---------------------------------------------------------------------------

/**
 * 商品名の【…】接頭辞から拾うカテゴリの正規化辞書。
 * 日英表記ゆれ（ビール / BEER など）をここで1つに寄せる。
 */
var CATEGORY_ALIASES = {
  'ビール': 'ビール', 'BEER': 'ビール', 'Beer': 'ビール',
  'ウイスキー': 'ウイスキー', 'WHISKEY': 'ウイスキー', 'WHISKY': 'ウイスキー',
  'Whisky': 'ウイスキー', 'Whiskey': 'ウイスキー',
  'リキュール': 'リキュール', 'LIQUEUR': 'リキュール', 'Liqueur': 'リキュール',
  '卸専売品': 'リキュール',
  '化粧箱': '化粧箱', '同梱物': '同梱物', 'ギフト資材': 'ギフト資材',
  '業務用': 'その他'
};

/** 資材として扱うカテゴリ。完成品と区別して集計できるようにする。 */
var MATERIAL_CATEGORIES = { '化粧箱': true, '同梱物': true, 'ギフト資材': true };

/**
 * Product_Master を読む。無ければ規則ベースのフォールバックを返す。
 * resolve(name) -> { name, category, itemType }
 */
function readProductMaster_() {
  var table = readSheetAsObjects_(SHEET_PRODUCT_MASTER, true);

  var map = {};
  var hasMaster = false;
  var costNotice = '';

  if (table.rows.length) {
    hasMaster = true;
    table.rows.forEach(function (r) {
      var raw = text_(r['商品名']);
      if (!raw) return;
      var costText = text_(r['原価']);
      map[normalizeKey_(raw)] = {
        name: text_(r['正規化商品名']) || raw,
        category: text_(r['カテゴリ']),
        itemType: text_(r['品目区分']),
        cost: parseNumber_(costText),
        // 空欄と「原価0円」を区別する。空欄なら粗利を出さず「原価未設定」と表示する。
        hasCost: costText !== ''
      };
    });

    // 原価の性質（実原価かサンプル値か）を Config ではなくマスタ側の注記欄から拾う
    table.rows.some(function (r) {
      var note = text_(r['原価注記']);
      if (note) { costNotice = note; return true; }
      return false;
    });
  }

  return {
    hasMaster: hasMaster,
    costNotice: costNotice,
    resolve: function (rawName) {
      var hit = map[normalizeKey_(rawName)];
      var fallback = guessProduct_(rawName);
      if (!hit) return fallback;
      return {
        name: hit.name || fallback.name,
        category: hit.category || fallback.category,
        itemType: hit.itemType || fallback.itemType,
        cost: hit.cost || 0,
        hasCost: !!hit.hasCost
      };
    }
  };
}

/**
 * マスタに載っていない商品名を規則で解決する。
 * 実データに存在する既知の綴り誤り・全角空白・接頭辞ゆれをここで吸収する。
 */
function guessProduct_(rawName) {
  var name = String(rawName)
    .replace(/[　]/g, ' ')      // 全角スペース
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/Rice Whisly Wonder/g, 'Rice Whisky Wonder'); // 既知の綴り誤り

  var category = 'その他';
  var m = name.match(/【([^】]+)】/);
  if (m) {
    var key = m[1].trim();
    category = CATEGORY_ALIASES[key] || CATEGORY_ALIASES[key.toUpperCase()] || 'その他';
  }

  return {
    name: name,
    category: category,
    itemType: MATERIAL_CATEGORIES[category] ? '資材' : '完成品',
    cost: 0,
    hasCost: false
  };
}

/**
 * 表記ゆれを吸収した突き合わせキー。
 * 空白・全半角括弧・記号差だけの違いは同一商品とみなす。
 */
function normalizeKey_(s) {
  return String(s)
    .replace(/[　\s]/g, '')
    .replace(/[（）]/g, function (c) { return c === '（' ? '(' : ')'; })
    .replace(/[〈〉<>]/g, '')
    .replace(/Whisly/gi, 'Whisky')
    .toLowerCase();
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

/** Config シート（キー / 値の2列）を読む。無ければ既定値。 */
function readConfig_() {
  var cfg = {};
  Object.keys(DEFAULT_CONFIG).forEach(function (k) {
    cfg[k] = DEFAULT_CONFIG[k] instanceof Array
      ? DEFAULT_CONFIG[k].slice()
      : DEFAULT_CONFIG[k];
  });

  var table = readSheetAsObjects_(SHEET_CONFIG, true);
  table.rows.forEach(function (r) {
    var key = text_(r['キー']);
    var val = text_(r['値']);
    if (!key) return;
    if (key === 'b2bCustomerTypes' || key === 'includeStatuses' || key === 'excludeStatuses') {
      cfg[key] = val ? val.split(',').map(function (s) { return s.trim(); }).filter(Boolean) : [];
    } else if (key === 'followOverdueDays') {
      cfg[key] = parseNumber_(val);
    } else if (key in cfg) {
      cfg[key] = val;
    }
  });

  return cfg;
}

// ---------------------------------------------------------------------------
// シート読み込み
// ---------------------------------------------------------------------------

/**
 * シートを「1行目=見出し」のオブジェクト配列として読む。
 * optional=true のときは、シートが無くても例外にせず空を返す。
 */
function readSheetAsObjects_(sheetName, optional) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    if (optional) return { headers: [], rows: [] };
    throw new Error(
      'シート「' + sheetName + '」が見つかりません。' +
      'docs/cw-dashboard-b2b.md の列定義に沿ってシートを用意してください。'
    );
  }

  var values = sheet.getDataRange().getDisplayValues();
  if (values.length < 2) return { headers: [], rows: [] };

  var headers = values[0].map(function (h) { return String(h).trim(); });
  var rows = [];

  for (var i = 1; i < values.length; i++) {
    var line = values[i];
    // 完全な空行はスキップ
    var hasValue = false;
    for (var c = 0; c < line.length; c++) {
      if (String(line[c]).trim() !== '') { hasValue = true; break; }
    }
    if (!hasValue) continue;

    var obj = {};
    for (var j = 0; j < headers.length; j++) {
      if (headers[j]) obj[headers[j]] = line[j];
    }
    rows.push(obj);
  }

  return { headers: headers, rows: rows };
}

// ---------------------------------------------------------------------------
// フィルター候補
// ---------------------------------------------------------------------------

/**
 * 複数選択フィルターの候補を、件数付きで生成する。
 * 件数はメニュー内の右側に小さく表示し、選ぶ前に規模が分かるようにする。
 */
function buildOptions_(rows) {
  var keys = ['customerType', 'segment', 'lead', 'repeat', 'customer', 'product', 'category', 'owner'];
  var out = {};

  keys.forEach(function (key) {
    var counts = {};
    rows.forEach(function (r) {
      var v = r[key];
      if (!v) return;
      counts[v] = (counts[v] || 0) + 1;
    });
    out[key] = Object.keys(counts)
      .map(function (v) { return { value: v, count: counts[v] }; })
      .sort(function (a, b) {
        return b.count - a.count || a.value.localeCompare(b.value, 'ja');
      });
  });

  return out;
}

/** 配送料は受注ヘッダの値。受注ごとに1回だけ数える。 */
function sumOrderShipping_(rows) {
  var seen = {};
  var total = 0;
  rows.forEach(function (r) {
    if (seen[r.orderNo]) return;
    seen[r.orderNo] = true;
    total += r.shipping || 0;
  });
  return total;
}

function countUnique_(rows, key) {
  var seen = {};
  var n = 0;
  rows.forEach(function (r) {
    var v = r[key];
    if (!v || seen[v]) return;
    seen[v] = true;
    n++;
  });
  return n;
}
