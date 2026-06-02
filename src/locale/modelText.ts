// Localized DISPLAY text for strings that live in src/model data files
// (button-preset catalog, system-icon catalog, clickable-reason labels, control
// type names). English / unmapped values fall back to the original. These are
// shown in the editor only — the EXPORT path deliberately passes no language, so
// exported slot names stay English/stable. Translations by Claude.
import type { Lang } from "./types";

type Target = Exclude<Lang, "en">;

// ── Button presets (ButtonPresetSection in Inspector) ───────────────────────
const BUTTON_PRESET_LABELS: Record<string, Record<Target, string>> = {
  blank: { ko: "비어 있음", es: "En blanco", ja: "空" },
  close: { ko: "창 닫기", es: "Cerrar ventana", ja: "ウィンドウを閉じる" },
  url: { ko: "URL 열기", es: "Abrir URL", ja: "URL を開く" },
  popup: { ko: "팝업 열기", es: "Abrir ventana emergente", ja: "ポップアップを開く" },
};
const BUTTON_PRESET_DESCS: Record<string, Record<Target, string>> = {
  blank: {
    ko: "동작이 없는 평범한 버튼입니다. 색상을 설정하고 컴포넌트를 직접 추가하세요.",
    es: "Un botón simple sin comportamiento. Configura los colores y añade componentes manualmente.",
    ja: "動作のないシンプルなボタンです。色を設定し、コンポーネントを手動で追加してください。",
  },
  close: {
    ko: "✕ 아이콘이 있는 빨간 둥근 버튼입니다. 패널 헤더에서 닫기용으로 사용하세요.",
    es: "Botón rojo redondo con el icono ✕. Úsalo en el encabezado del panel para cerrar.",
    ja: "✕ アイコン付きの赤い丸ボタンです。パネルのヘッダーで閉じる用に使います。",
  },
  url: {
    ko: "클릭하면 확인을 표시한 뒤 사용자의 브라우저에서 URL을 엽니다.",
    es: "Al hacer clic muestra una confirmación y luego abre la URL en el navegador del usuario.",
    ja: "クリックすると確認を表示し、ユーザーのブラウザで URL を開きます。",
  },
  popup: {
    ko: "클릭하면 제목, 본문, 닫기 버튼, 빨간 ✕ 닫기가 있는 팝업 대화 상자를 엽니다. 아래 Popup 컴포넌트에서 설정하세요.",
    es: "Al hacer clic abre un diálogo emergente con título, cuerpo, botón de descartar y una ✕ roja de cierre. Configúralo en el componente Popup de abajo.",
    ja: "クリックすると、タイトル・本文・閉じるボタン・赤い ✕ を備えたポップアップダイアログを開きます。下の Popup コンポーネントで設定してください。",
  },
};

export function localizedButtonPresetLabel(id: string, en: string, lang: Lang): string {
  if (lang === "en") return en;
  return BUTTON_PRESET_LABELS[id]?.[lang as Target] ?? en;
}
export function localizedButtonPresetDescription(id: string, en: string, lang: Lang): string {
  if (lang === "en") return en;
  return BUTTON_PRESET_DESCS[id]?.[lang as Target] ?? en;
}

// ── System icons (Library "System Images" tab + image picker), keyed by flag ─
const ICON_NAMES: Record<string, Record<Target, string>> = {
  useHelpIcon: { ko: "도움말", es: "Ayuda", ja: "ヘルプ" },
  useCloseIcon: { ko: "닫기", es: "Cerrar", ja: "閉じる" },
  useCheckIcon: { ko: "체크", es: "Marca", ja: "チェック" },
  useBackspaceIcon: { ko: "백스페이스", es: "Retroceso", ja: "バックスペース" },
  useSpinnerIcon: { ko: "스피너", es: "Indicador de carga", ja: "スピナー" },
  useLogoSprite: { ko: "UIX 로고", es: "Logo de UIX", ja: "UIX ロゴ" },
};
const ICON_DESCS: Record<string, Record<Target, string>> = {
  useHelpIcon: { ko: "채워진 물음표 — 정보 / 소개 버튼", es: "Signo de interrogación relleno — botones de info / acerca de", ja: "塗りつぶしの疑問符 — 情報 / 概要ボタン" },
  useCloseIcon: { ko: "빨간 원 안의 흰 X — 닫기 버튼", es: "X blanca en un círculo rojo — botón de cierre destructivo", ja: "赤い円の中の白い X — 閉じるボタン" },
  useCheckIcon: { ko: "체크 표시 — 체크박스 표시용", es: "Marca de verificación — para indicadores de casilla", ja: "チェックマーク — チェックボックス表示用" },
  useBackspaceIcon: { ko: "왼쪽 삭제 — 키패드 / 지우기 동작", es: "Borrar a la izquierda — acciones de teclado/borrado", ja: "左削除 — キーパッド / クリア操作" },
  useSpinnerIcon: { ko: "로딩 표시 — 미리보기에서 회전", es: "Indicador de carga — gira en la vista previa", ja: "読み込み表示 — プレビューで回転" },
  useLogoSprite: { ko: "UIX Studio 마크 — 뒷면 패널 브랜딩", es: "Marca de UIX Studio — branding del panel trasero", ja: "UIX Studio マーク — 背面パネルのブランディング" },
};

export function localizedIconName(flag: string, en: string, lang: Lang): string {
  if (lang === "en") return en;
  return ICON_NAMES[flag]?.[lang as Target] ?? en;
}
export function localizedIconDescription(flag: string, en: string, lang: Lang): string {
  if (lang === "en") return en;
  return ICON_DESCS[flag]?.[lang as Target] ?? en;
}

// ── Clickable reason labels (Inspector interactivity readout) ────────────────
export type ClickableReasonKey = "close" | "popup" | "link" | "button";
const CLICKABLE_REASONS: Record<ClickableReasonKey, Record<Lang, string>> = {
  close: { en: "closes the window", ko: "창을 닫음", es: "cierra la ventana", ja: "ウィンドウを閉じる" },
  popup: { en: "opens a popup", ko: "팝업을 엶", es: "abre una ventana emergente", ja: "ポップアップを開く" },
  link: { en: "opens a link", ko: "링크를 엶", es: "abre un enlace", ja: "リンクを開く" },
  button: { en: "button", ko: "버튼", es: "botón", ja: "ボタン" },
};
export function localizedClickableReason(key: ClickableReasonKey, lang: Lang): string {
  return CLICKABLE_REASONS[key][lang] ?? CLICKABLE_REASONS[key].en;
}

// ── Control type names (the "<label> <type>" suffix in hierarchy/inspector) ──
const CONTROL_TYPES: Record<string, Record<Target, string>> = {
  Checkbox: { ko: "체크박스", es: "Casilla", ja: "チェックボックス" },
  Toggle: { ko: "토글", es: "Interruptor", ja: "トグル" },
  Slider: { ko: "슬라이더", es: "Control deslizante", ja: "スライダー" },
  "Progress Bar": { ko: "진행률 표시줄", es: "Barra de progreso", ja: "プログレスバー" },
  "Text Field": { ko: "텍스트 필드", es: "Campo de texto", ja: "テキストフィールド" },
  "Float Field": { ko: "실수 필드", es: "Campo decimal", ja: "小数フィールド" },
  "Integer Field": { ko: "정수 필드", es: "Campo entero", ja: "整数フィールド" },
  "Radio Group": { ko: "라디오 그룹", es: "Grupo de radios", ja: "ラジオグループ" },
  Dropdown: { ko: "드롭다운", es: "Desplegable", ja: "ドロップダウン" },
  "Reference Field": { ko: "참조 필드", es: "Campo de referencia", ja: "参照フィールド" },
  "Color Picker": { ko: "색상 선택기", es: "Selector de color", ja: "カラーピッカー" },
};
export function localizedControlType(type: string, lang: Lang): string {
  if (lang === "en") return type;
  return CONTROL_TYPES[type]?.[lang as Target] ?? type;
}
