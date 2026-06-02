// Localized labels for the add-element palette (group headers + component
// display names) shown in AddMenu + ContextMenu. English falls back to the
// existing componentLabel() so the English UI is unchanged; ko/es/ja come from
// the maps below. System/plumbing types (RectTransform, BoxCollider, …) are
// intentionally absent — they keep their FrooxEngine names in every language.
import type { Lang } from "./types";
import { componentLabel, type PaletteItem } from "../model/palette";

type Target = Exclude<Lang, "en">;

const GROUP_LABELS: Record<string, Record<Target, string>> = {
  Visuals: { ko: "비주얼", es: "Visuales", ja: "ビジュアル" },
  Controls: { ko: "컨트롤", es: "Controles", ja: "コントロール" },
  Interaction: { ko: "상호작용", es: "Interacción", ja: "操作" },
  Layout: { ko: "레이아웃", es: "Diseño", ja: "レイアウト" },
};

const COMPONENT_LABELS: Record<string, Record<Target, string>> = {
  Image: { ko: "이미지", es: "Imagen", ja: "画像" },
  Text: { ko: "텍스트", es: "Texto", ja: "テキスト" },
  Spinner: { ko: "스피너", es: "Indicador de carga", ja: "スピナー" },
  Checkbox: { ko: "체크박스", es: "Casilla", ja: "チェックボックス" },
  Toggle: { ko: "토글", es: "Interruptor", ja: "トグル" },
  Slider: { ko: "슬라이더", es: "Control deslizante", ja: "スライダー" },
  ProgressBar: { ko: "진행률 표시줄", es: "Barra de progreso", ja: "プログレスバー" },
  Radio: { ko: "라디오", es: "Botón de radio", ja: "ラジオ" },
  RadioGroup: { ko: "라디오 그룹", es: "Grupo de radios", ja: "ラジオグループ" },
  Dropdown: { ko: "드롭다운", es: "Desplegable", ja: "ドロップダウン" },
  ColorPicker: { ko: "색상 선택기", es: "Selector de color", ja: "カラーピッカー" },
  TextField: { ko: "입력 필드", es: "Campo de entrada", ja: "入力フィールド" },
  ScrollArea: { ko: "스크롤 영역", es: "Área de desplazamiento", ja: "スクロール領域" },
  ReferenceField: { ko: "참조 필드", es: "Campo de referencia", ja: "参照フィールド" },
  Button: { ko: "버튼", es: "Botón", ja: "ボタン" },
  Hyperlink: { ko: "하이퍼링크", es: "Hipervínculo", ja: "ハイパーリンク" },
  Popup: { ko: "팝업", es: "Ventana emergente", ja: "ポップアップ" },
  Tabs: { ko: "탭", es: "Pestañas", ja: "タブ" },
  Spacer: { ko: "여백", es: "Espaciador", ja: "スペーサー" },
  VerticalLayout: { ko: "세로 레이아웃", es: "Diseño vertical", ja: "縦レイアウト" },
  HorizontalLayout: { ko: "가로 레이아웃", es: "Diseño horizontal", ja: "横レイアウト" },
  GridLayout: { ko: "그리드 레이아웃", es: "Diseño en cuadrícula", ja: "グリッドレイアウト" },
};

export function localizedGroupLabel(label: string, lang: Lang): string {
  if (lang === "en") return label;
  return GROUP_LABELS[label]?.[lang as Target] ?? label;
}

export function localizedComponentLabel(t: PaletteItem, lang: Lang): string {
  if (lang === "en") return componentLabel(t);
  return COMPONENT_LABELS[t]?.[lang as Target] ?? componentLabel(t);
}
